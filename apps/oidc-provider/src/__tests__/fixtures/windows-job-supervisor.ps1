[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$NodeExecutable,

  [Parameter(Mandatory = $true)]
  [string]$LauncherPath
)

$ErrorActionPreference = "Stop"
$exitCode = 1
$infoPointer = [IntPtr]::Zero
$jobHandle = [IntPtr]::Zero
$launcher = $null
$launcherStarted = $false

try {
  Add-Type -Language CSharp -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

namespace IamProcessSmoke
{
    public static class JobApi
    {
        public const uint JobObjectExtendedLimitInformation = 9;
        public const uint JobObjectLimitKillOnJobClose = 0x00002000;

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
    }
}
'@

  $jobHandle = [IamProcessSmoke.JobApi]::CreateJobObject(
    [IntPtr]::Zero,
    $null
  )
  if ($jobHandle -eq [IntPtr]::Zero) {
    throw [ComponentModel.Win32Exception]::new(
      [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    )
  }

  $basicInfo =
    New-Object IamProcessSmoke.JobApi+BasicLimitInformation
  $basicInfo.LimitFlags =
    [IamProcessSmoke.JobApi]::JobObjectLimitKillOnJobClose
  $extendedInfo =
    New-Object IamProcessSmoke.JobApi+ExtendedLimitInformation
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
  if (-not [IamProcessSmoke.JobApi]::SetInformationJobObject(
    $jobHandle,
    [IamProcessSmoke.JobApi]::JobObjectExtendedLimitInformation,
    $infoPointer,
    $infoLength
  )) {
    throw [ComponentModel.Win32Exception]::new(
      [Runtime.InteropServices.Marshal]::GetLastWin32Error()
    )
  }

  $startInfo = New-Object Diagnostics.ProcessStartInfo
  $startInfo.FileName = $NodeExecutable
  $startInfo.Arguments = '"' + $LauncherPath.Replace('"', '\"') + '"'
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
  if (-not [IamProcessSmoke.JobApi]::AssignProcessToJobObject(
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
    "Windows process-smoke Job supervisor failed: " + $_.Exception.Message
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
    [IamProcessSmoke.JobApi]::CloseHandle($jobHandle) | Out-Null
  }
  if ($launcher -ne $null) {
    $launcher.Dispose()
  }
}

exit $exitCode
