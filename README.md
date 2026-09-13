# SPARTNER Investor Portal — MVP

This is the first working prototype for SPARTNER's investor portal.

## Included
- Investor/admin login flow
- Investor dashboard
- Admin dashboard
- Transaction history
- Deposit request workflow
- Admin verify/reject workflow
- Responsive UI
- Local JSON persistence for prototype testing

## Run
Requires Node.js 20+.

```bash
npm start
```
Open `http://localhost:3000`.

### Initial data
- Test investor records have been removed. `data/users.json` contains only the Admin account.
- Create real investors from the Admin **Create Investor** page.

## Before production
Replace demo authentication and JSON storage with a production database/auth system; add HTTPS, secure password hashing (Argon2/bcrypt), CSRF protection, rate limiting, audit logs, backups, KYC/AML and required legal/compliance workflows. Do not use the demo credentials or JSON database for real investor funds.


## Finalized portal workflow

- Admin creates an Investor ID, email and initial password from **Investment** and the account is approved/active immediately.
- Investor logs in with **Investor ID or Email + Password**.
- Investor dashboard shows Total Investment, Current Balance, Total Withdraw and Transactions.
- Investor **Profile** is only a sidebar page. First profile save is allowed; later edits create an admin approval request.
- Admin Investment shows each investor's Total Deposit, Withdraw and Current Balance, with an individual Excel-compatible statement button.
- Investor Investment shows separate Deposit and Withdrawal histories with dates and statuses.

## Latest requested updates 

- Investor can download their own withdrawal statement/history as an Excel-compatible `.xls` file.
- Admin can download the complete withdrawal statement for all investors as an Excel-compatible `.xls` file.
- Company Profit/Loss is now displayed to investors only through screenshots/images uploaded by Admin.
- Admin can upload a dated Company Profit/Loss screenshot with an optional note.
- No automatic Company Profit/Loss calculation, balance impact, or investor-side computed Company Profit/Loss history is used for this feature.

## Final SPARTNER rules and UI updates

- Normal ROI: 1% per working day; ROI compounds on the updated balance.
- Silver ROI: 1% per working day; Silver Level Income: 10% of member ROI; withdrawal company commission: 5%.
- Gold ROI: 2% per working day; Gold Level Income: 12% of member ROI; withdrawal company commission: 0%.
- Normal withdrawal company commission: 10%.
- Normal Level Income: L1 10%, L2 10%, L3 7%, L4 5%, L5 3% of the downline member's ROI.
- Maximum network depth: 5 levels. Maximum 5 direct IDs per sponsor at each level.
- Silver eligibility: L1 >= ₹2,00,000 OR L1+L2 >= ₹4,00,000 OR L1+L2+L3 >= ₹5,00,000.
- Gold eligibility: L1 >= ₹5,00,000 OR L1+L2 >= ₹7,00,000 OR L1+L2+L3 >= ₹10,00,000.
- Cash Back: 5% of each verified deposit; Cash Back withdrawals are allowed Monday only.
- ROI is credited Monday-Friday; weekends receive no new ROI. Level Income is generated when a weekday member ROI is credited. Level Income withdrawals are available Friday-Sunday, 4:30 PM-11:30 PM IST.
- Investor Dashboard shows detailed Silver/Gold progress, including L1/L2/L3 amounts, combined business and remaining amount.
- Investor has My Downlines map with per-member Level Income/commission amounts and expandable branches.
- Investor has Rules & Benefits, ROI History, and Excel downloads for Transactions, ROI, Level Income, Cash Back and Withdrawals.
- Admin has Investor Login Access with search and secure Open Portal/Return to Admin flow.
- Admin Deposit is investor-wise: total verified deposit is shown, and clicking an investor opens each individual deposit with date/time/status/proof.
- Admin Cash Back shows earned and available amounts; pending/verified withdrawals update availability.
- Admin Level Income is an audit view with investor summary and detailed source member/level/ROI/rate/amount history.
- Admin My Downlines is replaced by Network Overview for monitoring the full investor network.
- Admin Dashboard includes deposit/withdrawal totals, ROI/current balances, cash back/level-income availability and pending request counts.
- Notifications were intentionally not added.


## Password recovery configuration

**Change Password** works for both Admin and Investors after login.

**Forgot Password** is available for both Admin and Investors and uses an email OTP. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER` and `SMTP_PASS` in `.env` to enable the email OTP. For Gmail, use a Google App Password rather than the normal Gmail password. Never share the App Password in chat.
