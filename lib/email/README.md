# Email System Documentation

## Overview
This directory contains the email sending system for SmartBC using AWS SES
credentials stored in the database. Sending goes through the AWS SES API
(via nodemailer's built-in SES transport, `@aws-sdk/client-ses`) — there is
no SMTP host/port/TLS negotiation involved.

## Configuration

### 1. Set the Encryption Key
Create or update `.env.local` with:
```
EMAIL_ENCRYPTION_KEY=your-secure-random-key-here
```

The key should be at least 32 characters long and securely managed in production.

### 2. Configure AWS SES in Admin Panel
Navigate to `/admin/configuracion` and add:
- Correo de remitente (From Email): a verified SES sender identity
- AWS Region: the region that identity is *actually* verified in (currently
  `eu-west-3` — SES verification and sandbox/production status are per-region,
  so pointing at the wrong region fails with "Email address is not verified"
  even though the sender exists and is verified elsewhere)
- AWS Access Key ID / Secret Access Key: from a dedicated IAM user with
  `ses:SendEmail` + `ses:SendRawEmail` permissions only

Click "Probar Conexión" to verify the credentials work.

## Database

The system uses three tables:

### email_config
Stores the encrypted AWS SES credentials. Only one record should exist.
- `aws_region` - AWS region the SES identity is verified in
- `aws_access_key_id` - IAM access key ID (not secret, stored in the clear)
- `aws_secret_access_key_encrypted` - Encrypted secret access key (AES-256-GCM)
- `aws_secret_access_key_iv` - Initialization vector for decryption
- `from_email` - Email address to use as sender (must be verified in SES)
- `from_name` - Display name for sender

### password_reset_tokens
Tracks password reset tokens with expiration.
- `user_id` - Reference to auth.users
- `token` - Secure random token (32 bytes hex)
- `expires_at` - Token expiration time (default 24 hours)
- `used_at` - When the token was used/consumed

## API Endpoints

### GET/POST `/api/admin/email-config`
Fetch (GET) or save (POST) the SES configuration. GET never returns the
secret access key, only `hasSecretAccessKey: boolean`. POST accepts
`{ awsRegion, awsAccessKeyId, awsSecretAccessKey?, fromEmail, fromName? }` —
omitting `awsSecretAccessKey` keeps the previously stored one.

### POST `/api/admin/email-config/test`
Test the SES connection (nodemailer's `transporter.verify()` against SES).

### POST `/api/admin/email-config/send-test`
Send a real test email to an arbitrary address using the stored config.
**Request:** `{ "to": "user@example.com" }`

### POST `/api/auth/forgot-password`
Request a password reset token and send reset email.

**Request:**
```json
{
  "email": "user@example.com"
}
```

### POST `/api/auth/reset-password`
Reset password using a valid token.

**Request:**
```json
{
  "token": "hex-encoded-32-byte-token",
  "password": "new-password"
}
```

## Usage Examples

### Send Password Reset Email
```typescript
import { createPasswordResetToken, sendPasswordResetEmail } from "@/lib/email/password-reset";

// Create token
const tokenData = await createPasswordResetToken(userId, 24); // 24 hours expiry
if (!tokenData) throw new Error("Failed to create token");

// Send email
const resetUrl = `${appUrl}/auth/reset-password?token=${tokenData.token}`;
await sendPasswordResetEmail(userEmail, userName, resetUrl);
```

### Send Generic Email
```typescript
import { sendEmail } from "@/lib/email/send-email";

const result = await sendEmail({
  to: "recipient@example.com",
  subject: "Welcome to SmartBC",
  html: "<h1>Hello!</h1><p>Welcome to our platform.</p>",
  replyTo: "support@example.com"
});

if (!result.success) {
  console.error("Failed to send email:", result.error);
}
```

### Send Invitation Email
```typescript
import { sendInvitationEmail } from "@/lib/email/password-reset";

const inviteUrl = `${appUrl}/auth/setup?token=${inviteToken}`;
await sendInvitationEmail(userEmail, userName, inviteUrl);
```

## Security Notes

1. **Encryption**: Secrets are encrypted using AES-256-GCM with a secure IV
   (`lib/crypto/secret.ts`, shared with the Zinto integration)
2. **Token Generation**: Uses cryptographically secure random bytes (32 bytes)
3. **Token Expiration**: Tokens expire after the specified duration (default 24h)
4. **One-time Use**: Tokens are marked as used after consumption
5. **Email Masking**: The forgot-password endpoint doesn't reveal if an email exists
6. **Environment Variables**: Always set `EMAIL_ENCRYPTION_KEY` in production
7. **IAM scope**: use a dedicated IAM user for smartbc's SES credentials
   (don't reuse another product's key) with only `ses:SendEmail` +
   `ses:SendRawEmail` permissions

## Migration

To apply the database schema:
```bash
supabase migration up
```

Or manually run the migration SQL in Supabase console.

## Email Templates

### Password Reset Email
Located in `password-reset.ts` - `sendPasswordResetEmail()` function
- Styled HTML email with clear branding
- 24-hour token expiration notice
- Fallback link for email clients that don't support buttons

### Invitation Email
Located in `password-reset.ts` - `sendInvitationEmail()` function
- Welcome message
- 7-day token expiration
- Instructions for account setup

## Troubleshooting

### Connection Failed
1. Verify the Access Key ID / Secret Access Key are correct and active in IAM
2. Confirm `from_email` (or its domain) is a **verified identity** in SES for
   the configured region
3. Confirm the SES account is out of sandbox mode (sandbox only allows
   sending to verified recipient addresses)
4. Read the raw AWS error message returned by "Probar Conexión" — SES errors
   are structured (e.g. `InvalidClientTokenId`, `SignatureDoesNotMatch`,
   `MessageRejected`), much more specific than the old SMTP error strings
5. ⚠️ **"Email address is not verified" even though you just verified it in
   the AWS console** → check the region first. Identity verification and
   sandbox/production access in SES are per-region, not account-wide. The
   `AWS Region` field here must match the region shown in the SES console
   URL/header where the identity is actually verified (currently
   `eu-west-3` / Europe-Paris) — not just any region you happen to have open.

### Emails Not Received
1. Check spam/junk folder
2. Verify sender email matches the verified SES identity
3. Review email headers for authentication issues (SPF/DKIM on the sending domain)
4. Check SES sending statistics / bounce & complaint rates in the AWS console

### Token Errors
1. Ensure token hasn't expired (24 hours default)
2. Verify token format is correct (64 character hex string)
3. Check if token was already used
4. Ensure token exists in database

## Environment Variables

Required for production:
```
NEXT_PUBLIC_APP_URL=https://your-domain.com
EMAIL_ENCRYPTION_KEY=your-secure-encryption-key-min-32-chars
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

Optional (fallback used only when `email_config` table is empty — see
`.env.example`):
```
AWS_SES_REGION=eu-west-1
AWS_SES_ACCESS_KEY_ID=your-ses-access-key-id
AWS_SES_SECRET_ACCESS_KEY=your-ses-secret-access-key
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
```
