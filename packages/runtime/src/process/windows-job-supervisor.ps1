# Package-shared supervisor for owned-process Windows Job ownership.
[CmdletBinding(DefaultParameterSetName = "Launch")]
param(
  [Parameter(ParameterSetName = "Launch", Mandatory = $true)]
  [string]$NodeExecutable,

  [Parameter(ParameterSetName = "Launch", Mandatory = $true)]
  [string]$LauncherPath,

  [Parameter(ParameterSetName = "Launch", Mandatory = $true)]
  [ValidateSet("bun", "node", "executable")]
  [string]$RuntimeKind,

  [Parameter(ParameterSetName = "Recover", Mandatory = $true)]
  [guid]$RecoverScope,

  [Parameter(ParameterSetName = "Recover", Mandatory = $true)]
  [int]$GraceMs,

  [Parameter(ParameterSetName = "Recover", Mandatory = $true)]
  [int]$TimeoutMs,

  [string]$JobApiCacheDirectory
)

$ErrorActionPreference = "Stop"
$exitCode = 1
$infoPointer = [IntPtr]::Zero
$jobHandle = [IntPtr]::Zero
$scopeHandle = [IntPtr]::Zero
$launcher = $null
$launcherStarted = $false

function Import-JobApi([string]$Source, [string]$CacheDirectory) {
  $temporaryPath = $null
  try {
    if (-not $CacheDirectory) {
      # The DLL is executable code. Use the current account's OS-resolved profile,
      # independent of temporary directories passed in the child environment.
      $localAppData = [Environment]::GetFolderPath([Environment+SpecialFolder]::LocalApplicationData)
      if (-not $localAppData) { throw "Windows local application data is unavailable" }
      $CacheDirectory = [IO.Path]::Combine($localAppData, "IAM", "WindowsJob")
    }

    $sha256 = [Security.Cryptography.SHA256]::Create()
    try {
      $sourceHash = [BitConverter]::ToString($sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes($Source)))
      $sourceHash = $sourceHash.Replace("-", "").ToLowerInvariant()
    }
    finally {
      $sha256.Dispose()
    }
    $cachePath = [IO.Path]::Combine($CacheDirectory, "IamOwnedProcess.JobApi.$sourceHash.dll")

    if (-not [IO.File]::Exists($cachePath)) {
      [IO.Directory]::CreateDirectory($CacheDirectory) | Out-Null
      $temporaryPath = [IO.Path]::Combine($CacheDirectory, "$([guid]::NewGuid().ToString('N')).dll")
      # Compile to disk without loading the staging DLL, so it can be moved on Windows.
      Add-Type -Language CSharp -TypeDefinition $Source -OutputAssembly $temporaryPath
      try {
        [IO.File]::Move($temporaryPath, $cachePath)
      }
      catch [IO.IOException] {
        # A concurrent publisher may have won. Keep its file and load it below.
        if (-not [IO.File]::Exists($cachePath)) { throw }
      }
    }

    $types = Add-Type -LiteralPath $cachePath -PassThru
    if ($types.FullName -notcontains "IamOwnedProcess.JobApi") {
      throw "Cached Windows Job assembly does not contain JobApi"
    }
    return
  }
  catch {
    # Cache failures are optional. Never remove a shared path another supervisor may be using.
  }
  finally {
    if ($temporaryPath) {
      try {
        [IO.File]::Delete($temporaryPath)
      }
      catch {
        # A staging cleanup failure must not prevent the in-memory fallback.
      }
    }
  }

  Add-Type -Language CSharp -TypeDefinition $Source
}

try {
  $jobApiSource = @'
using System;
using System.Runtime.InteropServices;

namespace IamOwnedProcess
{
    public static class JobApi
    {
        public const uint JobObjectExtendedLimitInformation = 9;
        public const uint JobObjectLimitKillOnJobClose = 0x00002000;
        public const uint JobObjectBasicAccountingInformation = 1;

        [StructLayout(LayoutKind.Sequential)]
        public struct BasicAccountingInformation
        {
            public long TotalUserTime;
            public long TotalKernelTime;
            public long ThisPeriodTotalUserTime;
            public long ThisPeriodTotalKernelTime;
            public uint TotalPageFaultCount;
            public uint TotalProcesses;
            public uint ActiveProcesses;
            public uint TotalTerminatedProcesses;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct IoCounters
        {
            public ulong ReadOperationCount;
            public ulong WriteOperationCount;
            public ulong OtherOperationCount;
            public ulong ReadTransferCount;
            public ulong WriteTransferCount;
            public ulong OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct BasicLimitInformation
        {
            public long PerProcessUserTimeLimit;
            public long PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize;
            public UIntPtr MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass;
            public uint SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct ExtendedLimitInformation
        {
            public BasicLimitInformation BasicLimitInformation;
            public IoCounters IoInfo;
            public UIntPtr ProcessMemoryLimit;
            public UIntPtr JobMemoryLimit;
            public UIntPtr PeakProcessMemoryUsed;
            public UIntPtr PeakJobMemoryUsed;
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        public static extern IntPtr CreateJobObject(
            IntPtr jobAttributes,
            string name
        );

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool SetInformationJobObject(
            IntPtr job,
            uint informationClass,
            IntPtr information,
            uint informationLength
        );

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool AssignProcessToJobObject(
            IntPtr job,
            IntPtr process
        );

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool CloseHandle(IntPtr handle);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool TerminateJobObject(IntPtr job, uint exitCode);

        [DllImport("kernel32.dll", SetLastError = true)]
        private static extern bool QueryInformationJobObject(
            IntPtr job,
            uint informationClass,
            out BasicAccountingInformation information,
            uint informationLength,
            IntPtr returnLength
        );

        public static IntPtr OpenScope(Guid id)
        {
            IntPtr handle = CreateJobObject(IntPtr.Zero, @"Local\iam-owned-" + id.ToString("D"));
            if (handle == IntPtr.Zero)
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            return handle;
        }

        public static uint ActiveProcesses(IntPtr job)
        {
            BasicAccountingInformation info;
            if (!QueryInformationJobObject(job, JobObjectBasicAccountingInformation,
                out info, (uint)Marshal.SizeOf(typeof(BasicAccountingInformation)), IntPtr.Zero))
                throw new System.ComponentModel.Win32Exception(Marshal.GetLastWin32Error());
            return info.ActiveProcesses;
        }
    }
}
'@

  Import-JobApi -Source $jobApiSource -CacheDirectory $JobApiCacheDirectory

  if ($PSCmdlet.ParameterSetName -eq "Recover") {
    $scopeHandle = [IamOwnedProcess.JobApi]::OpenScope($RecoverScope)
    $clock = [Diagnostics.Stopwatch]::StartNew()
    $forced = $false
    while ([IamOwnedProcess.JobApi]::ActiveProcesses($scopeHandle) -gt 0) {
      if ($clock.ElapsedMilliseconds -ge $TimeoutMs) {
        throw "owned Windows Job scope did not stop within the cleanup deadline"
      }
      if (-not $forced -and $clock.ElapsedMilliseconds -ge $GraceMs) {
        if (-not [IamOwnedProcess.JobApi]::TerminateJobObject($scopeHandle, 1)) {
          throw [ComponentModel.Win32Exception]::new([Runtime.InteropServices.Marshal]::GetLastWin32Error())
        }
        $forced = $true
      }
      Start-Sleep -Milliseconds 25
    }
    exit 0
  }

  $jobHandle = [IamOwnedProcess.JobApi]::CreateJobObject(
    [IntPtr]::Zero,
    $null
  )
  if ($jobHandle -eq [IntPtr]::Zero) {
    throw [ComponentModel.Win32Exception]::new(
      [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    )
  }

  $basicInfo =
    New-Object IamOwnedProcess.JobApi+BasicLimitInformation
  $basicInfo.LimitFlags =
    [IamOwnedProcess.JobApi]::JobObjectLimitKillOnJobClose
  $extendedInfo =
    New-Object IamOwnedProcess.JobApi+ExtendedLimitInformation
  $extendedInfo.BasicLimitInformation = $basicInfo
  $infoLength =
    [Runtime.InteropServices.Marshal]::SizeOf($extendedInfo)
  $infoPointer =
    [Runtime.InteropServices.Marshal]::AllocHGlobal($infoLength)
  [Runtime.InteropServices.Marshal]::StructureToPtr(
    $extendedInfo,
    $infoPointer,
    $false
  )
  if (-not [IamOwnedProcess.JobApi]::SetInformationJobObject(
    $jobHandle,
    [IamOwnedProcess.JobApi]::JobObjectExtendedLimitInformation,
    $infoPointer,
    $infoLength
  )) {
    throw [ComponentModel.Win32Exception]::new(
      [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    )
  }

  $startInfo = New-Object Diagnostics.ProcessStartInfo
  $startInfo.FileName = $NodeExecutable
  $launcherArgument = '"' + $LauncherPath.Replace('"', '\"') + '"'
  $startInfo.Arguments = if ($RuntimeKind -eq "bun") {
    "--no-env-file " + $launcherArgument
  }
  elseif ($RuntimeKind -eq "node") {
    $launcherArgument
  }
  else {
    ""
  }
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardInput = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true

  $launcher = New-Object Diagnostics.Process
  $launcher.StartInfo = $startInfo
  $launcherStarted = $launcher.Start()
  if (-not $launcherStarted) {
    throw "failed to start the Windows Job launcher"
  }
  if ($env:IAM_OWNED_PROCESS_SCOPE_ID) {
    # Assign the waiting launcher to the recoverable scope before checking the permit.
    # Revocation therefore fences even a supervisor starting during crash takeover.
    $scopeHandle = [IamOwnedProcess.JobApi]::OpenScope([guid]$env:IAM_OWNED_PROCESS_SCOPE_ID)
    if (-not [IamOwnedProcess.JobApi]::AssignProcessToJobObject($scopeHandle, $launcher.Handle)) {
      throw [ComponentModel.Win32Exception]::new([Runtime.InteropServices.Marshal]::GetLastWin32Error())
    }
    if (-not [IO.File]::Exists($env:IAM_OWNED_PROCESS_SCOPE_FILE)) {
      throw "owned process scope launch permit was revoked"
    }
  }
  if (-not [IamOwnedProcess.JobApi]::AssignProcessToJobObject(
    $jobHandle,
    $launcher.Handle
  )) {
    throw [ComponentModel.Win32Exception]::new(
      [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    )
  }

  $stdoutCopy = $launcher.StandardOutput.BaseStream.CopyToAsync(
    [Console]::OpenStandardOutput()
  )
  $stderrCopy = $launcher.StandardError.BaseStream.CopyToAsync(
    [Console]::OpenStandardError()
  )
  $launcher.StandardInput.WriteLine("assigned")
  $launcher.StandardInput.Close()
  $launcher.WaitForExit()
  $stdoutCopy.GetAwaiter().GetResult() | Out-Null
  $stderrCopy.GetAwaiter().GetResult() | Out-Null
  $exitCode = $launcher.ExitCode
}
catch {
  [Console]::Error.WriteLine(
    "Windows owned-process Job supervisor failed: " + $_.Exception.Message
  )
}
finally {
  if (
    $launcherStarted -and
    $launcher -ne $null -and
    -not $launcher.HasExited
  ) {
    $launcher.Kill()
    $launcher.WaitForExit()
  }
  if ($infoPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::FreeHGlobal($infoPointer)
  }
  if ($jobHandle -ne [IntPtr]::Zero) {
    [IamOwnedProcess.JobApi]::CloseHandle($jobHandle) | Out-Null
  }
  if ($scopeHandle -ne [IntPtr]::Zero) {
    [IamOwnedProcess.JobApi]::CloseHandle($scopeHandle) | Out-Null
  }
  if ($launcher -ne $null) {
    $launcher.Dispose()
  }
}

exit $exitCode
