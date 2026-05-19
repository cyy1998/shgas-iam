## ADDED Requirements

### Requirement: Track consecutive login failures
The system SHALL track consecutive failed login attempts per enabled user across password login and mobile verification-code login.

#### Scenario: Password login failure is tracked
- **WHEN** an enabled user submits an incorrect password to the password login endpoint
- **THEN** the system SHALL record one failed login attempt for that user

#### Scenario: Mobile login verification-code failure is tracked
- **WHEN** an enabled user submits an incorrect verification code to the mobile login endpoint using the user's bound mobile number
- **THEN** the system SHALL record one failed login attempt for that user

#### Scenario: Login methods share one streak
- **WHEN** an enabled user has failed password login attempts and failed mobile verification-code login attempts without a successful login between them
- **THEN** the system SHALL count those failures as one shared consecutive failure streak for that user

### Requirement: Suspend user after threshold failures
The system SHALL set an enabled user's status to `UserStatus.Pause` when the user's consecutive failed login attempts reach 5 within a rolling 30-minute window.

#### Scenario: Fifth failure within 30 minutes pauses the user
- **WHEN** an enabled user reaches 5 consecutive failed password or mobile verification-code login attempts within 30 minutes
- **THEN** the system SHALL update that user's status to `UserStatus.Pause`

#### Scenario: Failures older than 30 minutes do not count
- **WHEN** an enabled user has fewer than 5 consecutive failed login attempts inside the latest 30-minute window after expired failures are ignored
- **THEN** the system SHALL keep the user's status unchanged

#### Scenario: Triggering attempt still fails as credential error
- **WHEN** a failed login attempt triggers the user suspension threshold
- **THEN** the system SHALL reject that login attempt with the existing credential failure behavior

### Requirement: Report failure count and remaining attempts
The system SHALL include the current consecutive failure count and remaining attempts before suspension in the password or mobile login failure message for tracked enabled users.

#### Scenario: Failed password login reports remaining attempts
- **WHEN** an enabled user submits an incorrect password before reaching the suspension threshold
- **THEN** the system SHALL reject the login attempt with a message containing the current consecutive failure count and remaining attempts before account suspension

#### Scenario: Failed mobile login reports remaining attempts
- **WHEN** an enabled user submits an incorrect login verification code before reaching the suspension threshold
- **THEN** the system SHALL reject the login attempt with a message containing the current consecutive failure count and remaining attempts before account suspension

#### Scenario: Threshold failure reports suspension
- **WHEN** a failed login attempt reaches the suspension threshold
- **THEN** the system SHALL reject the login attempt with a message containing the current consecutive failure count, zero remaining attempts, and that the account has been suspended

### Requirement: Reset failure streak after successful login
The system SHALL clear a user's tracked consecutive failed login attempts after a successful password login or successful mobile verification-code login.

#### Scenario: Successful password login clears failures
- **WHEN** an enabled user successfully logs in with a password after one or more tracked failures
- **THEN** the system SHALL clear the user's tracked consecutive failure streak

#### Scenario: Successful mobile login clears failures
- **WHEN** an enabled user successfully logs in with a mobile verification code after one or more tracked failures
- **THEN** the system SHALL clear the user's tracked consecutive failure streak

### Requirement: Limit scope of suspension tracking
The system SHALL apply login failure suspension only to global password login and global mobile verification-code login.

#### Scenario: Non-login verification-code failure is ignored
- **WHEN** verification-code validation fails for password reset, mobile binding, or any usage other than login
- **THEN** the system SHALL NOT record a login failure streak attempt

#### Scenario: Third-party login failure is ignored
- **WHEN** OA login or WeChat login fails
- **THEN** the system SHALL NOT record a login failure streak attempt

#### Scenario: Unknown or inactive user is not tracked
- **WHEN** a login attempt cannot be associated with an existing enabled user
- **THEN** the system SHALL NOT create or update a user-scoped login failure streak
