// ============================================================
// SPARTNER INVESTOR PORTAL
// FRONTEND - COMPLETE APP.JS
// ============================================================

"use strict";


// ============================================================
// GLOBAL STATE
// ============================================================

let currentUser = null;
let currentDashboard = null;
let dashboardLoading = false;
let companyPerformanceRecords = [];
let adminInvestorRecords = [];


// ============================================================
// HELPERS
// ============================================================

const $ = (selector) =>
  document.querySelector(selector);


const $$ = (selector) =>
  Array.from(document.querySelectorAll(selector));


const fmt = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(Number(n) || 0);


function escapeHtml(value) {

  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

}


function normalizeRole(role) {

  return String(role || "")
    .trim()
    .toLowerCase();

}


function isAdminUser(user) {

  return normalizeRole(user?.role) === "admin";

}


function getUserId(user) {

  return (
    user?.userId ||
    user?.id ||
    ""
  );

}


function getTransactionStatus(transaction) {

  return String(
    transaction?.status || "PENDING"
  ).toUpperCase();

}


function setMessage(selector, message, isError = false) {

  const element = $(selector);

  if (!element) return;

  element.textContent = message || "";

  element.classList.toggle(
    "error",
    Boolean(isError)
  );

}


function setButtonLoading(button, loading, loadingText, normalText) {

  if (!button) return;

  button.disabled = Boolean(loading);

  button.textContent =
    loading
      ? loadingText
      : normalText;

}


// ============================================================
// API
// ============================================================

async function api(url, options = {}) {

  const requestOptions = {
    credentials: "same-origin",
    ...options,

    headers: {
      ...(options.body instanceof FormData
        ? {}
        : {
            "Content-Type": "application/json"
          }),

      ...(options.headers || {})
    }
  };


  const response =
    await fetch(
      url,
      requestOptions
    );


  let data = {};

  try {

    data =
      await response.json();

  } catch {

    data = {};

  }


  if (!response.ok) {

    const error =
      new Error(
        data.error ||
        data.message ||
        `Request failed (${response.status})`
      );


    error.status =
      response.status;


    error.data =
      data;


    throw error;

  }


  return data;

}


// ============================================================
// FORM DATA API
// ============================================================

async function apiFormData(url, formData) {  

  const response =
    await fetch(
      url,
      {
        method: "POST",
        credentials: "same-origin",
        body: formData
      }
    );


  let data = {};

  try {

    data =
      await response.json();

  } catch {

    data = {};

  }


  if (!response.ok) {

    const error =
      new Error(
        data.error ||
        data.message ||
        `Request failed (${response.status})`
      );


    error.status =
      response.status;


    error.data =
      data;


    throw error;

  }


  return data;

}


// ============================================================
// AUTH ERROR
// ============================================================

function handleAuthError(error) {

  if (
    error &&
    Number(error.status) === 401
  ) {

    currentUser = null;
    currentDashboard = null;


    if ($("#portalView")) {

      $("#portalView").hidden =
        true;

    }


    if ($("#loginView")) {

      $("#loginView").hidden =
        false;

    }


    if ($("#loginError")) {

      $("#loginError").textContent =
        "Your session has expired. Please login again.";

    }


    return true;

  }


  return false;

}


// ============================================================
// STAT CARD
// ============================================================

function stat(label, value) {

  return `

    <div class="stat">

      <div class="label">
        ${escapeHtml(label)}
      </div>

      <div class="value">
        ${value}
      </div>

    </div>

  `;

}


// ============================================================
// DASHBOARD LOAD
// ============================================================

async function load(showError = false) {

  if (dashboardLoading) {

    return Boolean(currentDashboard);

  }


  dashboardLoading =
    true;


  try {

    const data =
      await api(
        "/api/dashboard"
      );


    currentDashboard =
      data || {};


    currentUser =
      data?.user || null;


    render(
      currentDashboard
    );


    return true;

  } catch (error) {

    console.error(
      "Dashboard error:",
      error
    );


    if (
      handleAuthError(error)
    ) {

      return false;

    }


    if (
      showError &&
      $("#loginError")
    ) {

      $("#loginError").textContent =
        error.message ||
        "Unable to load dashboard.";

    }


    return false;

  } finally {

    dashboardLoading =
      false;

  }

}


// ============================================================
// UPDATE USER DISPLAY
// ============================================================

function updateUserDisplay(user) {

  if (!user) return;


  const name =
    user.name ||
    "Investor";


  const role =
    user.role ||
    "investor";


  const letter =
    name
      .charAt(0)
      .toUpperCase();


  if ($("#sideUserName")) {

    $("#sideUserName").textContent =
      name;

  }


  if ($("#sideUserRole")) {

    $("#sideUserRole").textContent =
      role;

  }


  if ($("#topUserName")) {

    $("#topUserName").textContent =
      name;

  }


  if ($("#avatarLetter")) {

    $("#avatarLetter").textContent =
      letter;

  }


  if ($("#topAvatar")) {

    $("#topAvatar").textContent =
      letter;

  }


  if ($("#settingsUserId")) {

    $("#settingsUserId").textContent =
      getUserId(user) ||
      "—";

  }

}


// ============================================================
// RESTORED ADMIN DASHBOARD DETAILS
// ============================================================

async function renderAdminDashboardDetails(safeData) {
  try {
    const tx = Array.isArray(safeData?.transactions) ? safeData.transactions : [];
    const investorData = await api('/api/admin/investors');
    const investors = Array.isArray(investorData?.investors) ? investorData.investors : [];
    adminInvestorRecords = investors;

    const totalAvailable = investors.reduce((s, x) => s + Number(x.availableToWithdraw || 0), 0);
    const totalROI = investors.reduce((s, x) => s + Number(x.roi || 0), 0);
    const totalWithdrawals = tx.filter(t => ['WITHDRAWAL','CASHBACK_WITHDRAWAL','LEVEL_INCOME_WITHDRAWAL'].includes(String(t.type || '').toUpperCase()) && getTransactionStatus(t) === 'VERIFIED')
      .reduce((s, t) => s + Number(t.amount || 0), 0);
    const totalCashback = investors.reduce((s, x) => s + Number(x.cashBack || 0), 0);
    const totalLevelIncome = investors.reduce((s, x) => s + Number(x.levelIncome || 0), 0);
    const pending = tx.filter(t => getTransactionStatus(t) === 'PENDING');

    if ($('#adminAvailableBalance')) $('#adminAvailableBalance').textContent = fmt(totalAvailable);
    if ($('#adminTotalWithdrawals')) $('#adminTotalWithdrawals').textContent = fmt(totalWithdrawals);
    if ($('#adminDashboardSecondary')) $('#adminDashboardSecondary').innerHTML = `
      <div class="admin-mini-stat"><span>Available Cash Back</span><strong>${fmt(totalCashback)}</strong></div>
      <div class="admin-mini-stat"><span>Available Level Income</span><strong>${fmt(totalLevelIncome)}</strong></div>
      <div class="admin-mini-stat"><span>Pending Deposits</span><strong>${pending.filter(t=>String(t.type||'').toUpperCase()==='DEPOSIT').length} · ${fmt(Number(safeData.stats?.pendingDepositAmount || 0))}</strong></div>
      <div class="admin-mini-stat"><span>Pending Withdrawals</span><strong>${pending.filter(t=>['WITHDRAWAL','CASHBACK_WITHDRAWAL','LEVEL_INCOME_WITHDRAWAL'].includes(String(t.type||'').toUpperCase())).length} · ${fmt(Number(safeData.stats?.pendingWithdrawalAmount || 0))}</strong></div>
      <div class="admin-mini-stat"><span>Silver Investors</span><strong>${Number(safeData.stats?.silverInvestors || 0)}</strong></div>
      <div class="admin-mini-stat"><span>Gold Investors</span><strong>${Number(safeData.stats?.goldInvestors || 0)}</strong></div>
      <div class="admin-mini-stat"><span>Total ROI Earned</span><strong>${fmt(Number(safeData.stats?.totalRoi || 0))}</strong></div>
      <div class="admin-mini-stat"><span>Company Commission</span><strong>${fmt(Number(safeData.stats?.verifiedCompanyCommission || 0))}</strong></div>`;

    const depositTotal = tx.filter(t => String(t.type || '').toUpperCase() === 'DEPOSIT' && getTransactionStatus(t) === 'VERIFIED').reduce((s, t) => s + Number(t.amount || 0), 0);
    const withdrawalTotal = totalWithdrawals;
    const maxBar = Math.max(depositTotal, withdrawalTotal, totalAvailable, 1);
    if ($('#adminDepositWithdrawChart')) {
      $('#adminDepositWithdrawChart').innerHTML = `
        <div class="bar-item"><strong class="stat-money-orange">${fmt(depositTotal)}</strong><div class="bar" style="height:${Math.max(5, depositTotal / maxBar * 145)}px"></div><div class="bar-label">Verified Deposits</div></div>
        <div class="bar-item"><strong class="stat-money-orange">${fmt(withdrawalTotal)}</strong><div class="bar withdrawal" style="height:${Math.max(5, withdrawalTotal / maxBar * 145)}px"></div><div class="bar-label">Verified Withdrawals</div></div>
        <div class="bar-item"><strong class="stat-money-green">${fmt(totalAvailable)}</strong><div class="bar" style="height:${Math.max(5, totalAvailable / maxBar * 145)}px"></div><div class="bar-label">ROI Withdrawal Allowance</div></div>`;
    }

    const balanceTotal = investors.reduce((s, x) => s + Number(x.currentBalance || 0), 0);
    if ($('#adminRoiOverview')) {
      $('#adminRoiOverview').innerHTML = `
        <div class="roi-line roi-card-orange"><span>Today's ROI</span><strong class="stat-money-orange">${fmt(totalROI)}</strong></div>
        <div class="roi-line roi-card-green"><span>Current Investor Balance</span><strong class="stat-money-green">${fmt(balanceTotal)}</strong></div>
        <div class="roi-line roi-card-orange"><span>Verified Withdrawals</span><strong class="stat-money-orange">${fmt(totalWithdrawals)}</strong></div>`;
    }
  } catch (error) {
    console.error('Admin dashboard details error:', error);
  }
}

// ============================================================
// RENDER DASHBOARD
// ============================================================

function render(data) {

  const safeData =
    data || {};


  const user =
    safeData.user || {};


  currentUser =
    user;


  if ($("#loginView")) {

    $("#loginView").hidden =
      true;

  }


  if ($("#portalView")) {

    $("#portalView").hidden =
      false;

  }


  updateUserDisplay(
    user
  );


  if ($("#name")) {

    $("#name").textContent =
      user.name || "";

  }


  if ($("#roleLabel")) {

    $("#roleLabel").textContent =
      String(
        user.role || ""
      ).toUpperCase();

  }


  if ($("#displayUserId")) {

    $("#displayUserId").textContent =
      getUserId(user) ||
      "—";

  }


  const isAdmin =
    isAdminUser(user);

  $$('.investor-only-nav').forEach(button => { button.hidden = isAdmin; });
  const impersonating = Boolean(user.impersonatingAdmin);
  $$(".admin-access-nav").forEach(button => { button.hidden = !isAdmin; });
  if ($("#returnToAdminBtn")) $("#returnToAdminBtn").hidden = !impersonating;

  // ==========================================================
  // ADMIN
  // ==========================================================

  if (isAdmin) {

    if ($("#depositBtn")) {

      $("#depositBtn").hidden =
        true;

    }


    if ($("#withdrawBtn")) {

      $("#withdrawBtn").hidden =
        true;

    }


    if ($("#investorStats")) {

      $("#investorStats").hidden =
        true;

    }


    $$(".admin-create-nav").forEach(
      button => {
        button.hidden = false;
      }
    );


    if ($("#adminStats")) {

      $("#adminStats").hidden =
        false;


      const investorsCount = Number(safeData.stats?.investors ?? 0);
      const totalDeposit = Number(safeData.stats?.verifiedDeposits ?? 0);
      const totalCapital = Number(safeData.stats?.totalCapital ?? 0);
      const pending = Number(safeData.stats?.pending ?? 0);
      const silverCount = Number(safeData.stats?.silverInvestors ?? 0);
      const goldCount = Number(safeData.stats?.goldInvestors ?? 0);
      const totalRoi = Number(safeData.stats?.totalRoi ?? 0);
      const pendingDepositAmount = Number(safeData.stats?.pendingDepositAmount ?? 0);
      const pendingWithdrawalAmount = Number(safeData.stats?.pendingWithdrawalAmount ?? 0);
      const companyCommission = Number(safeData.stats?.verifiedCompanyCommission ?? 0);

      $("#adminStats").innerHTML = `
        <div class="stat stat-accent-blue"><div class="label">Total Investors</div><div class="value stat-number-blue">${investorsCount}</div><div class="stat-sub positive">Active Investors</div></div>
        <div class="stat stat-accent-orange"><div class="label">Total Deposit</div><div class="value stat-money-orange">${fmt(totalDeposit)}</div><div class="stat-sub">Verified Deposits</div></div>
        <div class="stat stat-accent-orange"><div class="label">Current Balance</div><div class="value stat-money-orange">${fmt(totalCapital)}</div><div class="stat-sub">Live Investor Balances</div></div>
        <div class="stat stat-accent-green"><div class="label">Available to Withdraw</div><div class="value stat-money-green" id="adminAvailableBalance">₹0</div><div class="stat-sub">Investor ROI Allowance</div></div>
        <div class="stat stat-accent-orange"><div class="label">Total Withdrawals</div><div class="value stat-money-orange" id="adminTotalWithdrawals">₹0</div><div class="stat-sub">All Time</div></div>
        <div class="stat stat-accent-blue"><div class="label">Pending Requests</div><div class="value stat-number-blue">${pending}</div><div class="stat-sub">Awaiting Admin Action</div></div>
        <div class="stat stat-accent-green"><div class="label">Silver Investors</div><div class="value stat-number-blue">${silverCount}</div><div class="stat-sub">Eligible</div></div>
        <div class="stat stat-accent-orange"><div class="label">Gold Investors</div><div class="value stat-number-blue">${goldCount}</div><div class="stat-sub">Eligible</div></div>
        <div class="stat stat-accent-blue"><div class="label">Total ROI Earned</div><div class="value stat-number-blue">${fmt(totalRoi)}</div><div class="stat-sub">All Investors</div></div>
        <div class="stat stat-accent-orange"><div class="label">Pending Deposits</div><div class="value stat-money-orange">${fmt(pendingDepositAmount)}</div><div class="stat-sub">Awaiting verification</div></div>
        <div class="stat stat-accent-orange"><div class="label">Pending Withdrawals</div><div class="value stat-money-orange">${fmt(pendingWithdrawalAmount)}</div><div class="stat-sub">Awaiting payment</div></div>
        <div class="stat stat-accent-green"><div class="label">Company Commission</div><div class="value stat-money-green">${fmt(companyCommission)}</div><div class="stat-sub">Verified withdrawals</div></div>
      `;

      if ($("#adminDashboardBody")) {
        $("#adminDashboardBody").hidden = false;
        renderAdminDashboardDetails(safeData);
      }

    }

  }


  // ==========================================================
  // INVESTOR
  // ==========================================================

  else {

    if ($("#depositBtn")) {

      $("#depositBtn").hidden =
        false;

    }


    if ($("#withdrawBtn")) {

      $("#withdrawBtn").hidden =
        false;

    }


    if ($("#investorStats")) {
    $("#investorStats").hidden = false;

    const transactions =
        Array.isArray(safeData.transactions)
            ? safeData.transactions
            : [];

    const totalDeposit =
        Number(user.totalInvestment ?? 0);

    const currentBalance =
        Number(user.currentBalance ?? 0);

    const verifiedWithdraw =
        transactions
            .filter(
                transaction =>
                    String(transaction.type).toUpperCase() ===
                        "WITHDRAWAL" &&
                    getTransactionStatus(transaction) ===
                        "VERIFIED"
            )
            .reduce(
                (sum, transaction) =>
                    sum + Number(transaction.amount || 0),
                0
            );

    // DAILY ROI DISPLAY
    // Use the ROI actually credited by the server.
    // The server sets todayROI = 0 on Saturday/Sunday.
    const dailyROI =
        Number(user.todayROI || 0);

    $("#investorStats").innerHTML =
        stat(
            "Total Investment",
            fmt(totalDeposit)
        ) +

        stat(
            "Current Balance",
            fmt(currentBalance)
        ) +

        
        stat(
            `${user.tier || "Normal"} ROI (${Number(user.roiRate || 1)}%)`,
            fmt(dailyROI)
        ) +

        stat(
            "Available to Withdraw",
            fmt(Number(user.withdrawalAllowance ?? 0))
        ) +

        stat(
            "Total Withdraw",
            fmt(verifiedWithdraw)
        ) +

        stat(
            "Total Level Income",
            fmt(Number(user.levelIncomeTotal ?? user.levelIncomeBalance ?? 0))
        ) +

        stat(
            "Transactions",
            transactions.length
        );

    renderInvestorTierPanel(user);
    renderInvestorTargetPanel(user);
}


    $$(".admin-create-nav").forEach(
      button => {
        button.hidden = true;
      }
    );


    if ($("#adminStats")) {

      $("#adminStats").hidden =
        true;

    }

    if ($("#adminDashboardBody")) {
      $("#adminDashboardBody").hidden = true;
    }


    loadProfile(
      user
    );

  }

  // Rules are useful to both Admin and Investors.
  renderRulesPage();

  if (!isAdmin) {
    loadPhase3Data();
  }

  // ==========================================================
  // TRANSACTIONS
  // ==========================================================

  const transactions =
    Array.isArray(
      safeData.transactions
    )
      ? safeData.transactions
      : [];


  if ($("#txCount")) {

    $("#txCount").textContent =
      `${transactions.length} records`;

  }


  if ($("#actionHead")) {

    $("#actionHead").hidden =
      !isAdmin;

  }


  if (!$("#txBody")) {

    return;

  }


  if (transactions.length === 0) {

    $("#txBody").innerHTML = `

      <tr>

        <td colspan="${isAdmin ? 8 : 7}">
          No transactions yet.
        </td>

      </tr>

    `;

    return;

  }


  $("#txBody").innerHTML =
    transactions
      .map(transaction => renderTransactionRow(transaction, isAdmin))
      .join("");

  if (!isAdmin) {
    renderInvestorSpecialPages();
  const roiHistory = Array.isArray(currentUser.roiHistory) ? currentUser.roiHistory : [];
  if ($('#roiHistoryBody')) $('#roiHistoryBody').innerHTML = roiHistory.length ? roiHistory.slice().sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(x => `<tr><td>${escapeHtml(formatLevelIncomeDate(x.date))}</td><td>${fmt(x.openingBalance||0)}</td><td>${fmt(x.roiRate||0)}%</td><td><strong>${fmt(x.amount||0)}</strong></td><td>${fmt(x.closingBalance||0)}</td></tr>`).join('') : '<tr><td colspan="5">No ROI history yet.</td></tr>';
  if ($('#roiTotalEarned')) $('#roiTotalEarned').textContent = fmt(roiHistory.reduce((sum,x)=>sum+Number(x.amount||0),0));
  if ($('#roiCurrentBalance')) $('#roiCurrentBalance').textContent = fmt(currentUser.currentBalance || 0);
  if ($('#roiCurrentRate')) $('#roiCurrentRate').textContent = `${Number(currentUser.roiRate || 1)}%`;

  }

}


// ============================================================
// TRANSACTION ROW
// ============================================================

function renderTransactionRow(
  transaction,
  isAdmin
) {

  const id =
    transaction?.id ??
    transaction?._id ??
    "";


  const type =
    transaction?.type ??
    "";


  const amount =
    Number(
      transaction?.amount ?? 0
    );


  const utrNumber =
    transaction?.utrNumber ??
    transaction?.utr ??
    transaction?.transactionNumber ??
    "";


  const paymentScreenshot =
    transaction?.paymentScreenshot ??
    transaction?.paymentProof ??
    transaction?.screenshot ??
    "";

  const adminProof =
    transaction?.adminProof ??
    transaction?.adminProofScreenshot ??
    "";  


  const status =
    getTransactionStatus(
      transaction
    );


  const date =
    transaction?.date ??
    transaction?.createdAt ??
    "";


  const statusClass =
    status.toLowerCase();


  // ==========================================================
  // ADMIN ACTION
  // ==========================================================

  let actionCell = "";


  if (isAdmin) {

    if (status === "PENDING") {

      actionCell = `

        <td>

          <button
            type="button"
            class="mini"
            data-action="verify"
            data-id="${escapeHtml(id)}"
            data-type="${escapeHtml(type)}"
          >
            Verify
          </button>

          <button
            type="button"
            class="mini"
            data-action="reject"
            data-id="${escapeHtml(id)}"
          >
            Reject
          </button>

        </td>

      `;

    } else {

      actionCell = `

        <td>
          —
        </td>

      `;

    }

  }


  // ==========================================================
  // UTR
  // ==========================================================

  let utrCell =
    "—";


  if (
    String(type).toUpperCase() ===
    "DEPOSIT"
  ) {

    utrCell =
      utrNumber
        ? escapeHtml(utrNumber)
        : `<span class="muted">Not provided</span>`;

  }


  // ==========================================================
  // PAYMENT PROOF
  // ==========================================================

  let proofCell =
    "—";


  if (
    String(type).toUpperCase() ===
    "DEPOSIT"
  ) {

    if (paymentScreenshot) {

      proofCell = `

        <button
          type="button"
          class="mini"
          data-action="proof"
          data-url="${escapeHtml(paymentScreenshot)}"
          data-utr="${escapeHtml(utrNumber)}"
        >
          View Proof
        </button>

      `;

    } else {

      proofCell = `

        <span class="muted">
          No proof
        </span>

      `;

    }

  }

  if (adminProof) {
    proofCell += `
        <button
            type="button"
            class="mini"
            data-action="proof"
            data-url="${escapeHtml(adminProof.data || adminProof)}"
            data-utr="${escapeHtml(utrNumber)}"
        >
            View Admin Proof
        </button>
    `;
}


  return `

    <tr>

      <td>
        ${escapeHtml(id)}
      </td>

      <td>
        ${escapeHtml(type)}
      </td>

      <td>
        ${fmt(amount)}
      </td>

      <td>
        ${utrCell}
      </td>

      <td>
        ${proofCell}
      </td>

      <td>

        <span
          class="badge ${escapeHtml(statusClass)}"
        >
          ${escapeHtml(status)}
        </span>

      </td>

      <td>
        ${escapeHtml(
          formatDate(date)
        )}
      </td>

      ${actionCell}

    </tr>

  `;

}


// ============================================================
// DATE FORMAT
// ============================================================

function formatDate(value) {

  if (!value) {

    return "";

  }


  const date =
    new Date(value);


  if (
    Number.isNaN(
      date.getTime()
    )
  ) {

    return String(value);

  }


  return date.toLocaleString(
    "en-IN",
    {
      dateStyle: "medium",
      timeStyle: "short"
    }
  );

}


// ============================================================
// PROFILE LOAD
// ============================================================

function loadProfile(user) {

  if (!user) return;


  if ($("#profileUserId")) {

    $("#profileUserId").value =
      getUserId(user);

  }


  if ($("#profileName")) {

    $("#profileName").value =
      user.name || "";

  }


  if ($("#profileEmail")) {

    $("#profileEmail").value =
      user.email || "";

  }


  if ($("#profilePhone")) {

    $("#profilePhone").value =
      user.phone ||
      user.phoneNumber ||
      "";

  }


  if ($("#profilePan")) {

    $("#profilePan").value =
      user.pan ||
      user.PAN ||
      "";

  }


  if ($("#profileAadhaar")) {

    $("#profileAadhaar").value =
      user.aadhaar ||
      user.aadhaarNumber ||
      "";

  }

  if ($("#profileAddress")) {
    $("#profileAddress").value =
      user.address || "";
  }

  if ($("#profileCity")) {
    $("#profileCity").value =
      user.city || "";
  }

  if ($("#profileState")) {
    $("#profileState").value =
      user.state || "";
  }

  if ($("#profilePincode")) {
    $("#profilePincode").value =
      user.pincode || "";
  }

  const profileSubtitle = document.querySelector('#section-profile .section-subtitle');
  if (profileSubtitle) {
    profileSubtitle.textContent = isAdminUser(user)
      ? 'Manage your Admin profile details and login password.'
      : 'Complete your details. Future changes are sent to admin for approval.';
  }

  const profileButton =
    $("#profileForm button[type='submit']");

  if (profileButton) {
    profileButton.textContent =
      user.profileCompletedAt
        ? "Request Changes"
        : "Save Profile";
  }

}


// ============================================================
// PROFILE SAVE
// ============================================================

async function handleProfileSubmit(event) {

  event.preventDefault();


  const msg =
    $("#profileMsg");


  if (!msg) return;


  msg.textContent =
    "";


  const phone =
    $("#profilePhone")
      ?.value
      ?.trim() || "";


  const pan =
    $("#profilePan")
      ?.value
      ?.trim()
      .toUpperCase() || "";


  const aadhaar =
    $("#profileAadhaar")
      ?.value
      ?.replace(/\D/g, "") || "";

  const address =
    $("#profileAddress")
      ?.value
      ?.trim() || "";

  const city =
    $("#profileCity")
      ?.value
      ?.trim() || "";

  const state =
    $("#profileState")
      ?.value
      ?.trim() || "";

  const pincode =
    $("#profilePincode")
      ?.value
      ?.replace(/\D/g, "") || "";


  if (!phone) {

    msg.textContent =
      "Phone number is required.";

    return;

  }


  if (
    !/^[0-9+\-\s()]{7,15}$/.test(
      phone
    )
  ) {

    msg.textContent =
      "Enter a valid phone number.";

    return;

  }


  if (
    pan &&
    !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(
      pan
    )
  ) {

    msg.textContent =
      "Enter a valid PAN number.";

    return;

  }


  if (
    aadhaar &&
    !/^\d{12}$/.test(
      aadhaar
    )
  ) {

    msg.textContent =
      "Aadhaar must contain 12 digits.";

    return;

  }


  const submitButton =
    $("#profileForm button[type='submit']");


  setButtonLoading(
    submitButton,
    true,
    "Saving...",
    "Save Changes"
  );


  try {

    const result =
      await api(
        "/api/profile",
        {
          method: "POST",

          body:
            JSON.stringify({
              phone,
              pan,
              aadhaar,
              address,
              city,
              state,
              pincode
            })
        }
      );


    msg.textContent =
      result.message ||
      "Profile updated successfully.";


    await load(
      false
    );

  } catch (error) {

    console.error(
      "Profile update error:",
      error
    );


    if (
      !handleAuthError(error)
    ) {

      msg.textContent =
        error.message ||
        "Unable to update profile.";

    }

  } finally {

    setButtonLoading(
      submitButton,
      false,
      "Saving...",
      "Save Changes"
    );

  }

}


// ============================================================
// ADMIN TRANSACTION STATUS
// ============================================================

async function setStatus(
  id,
  status,
  adminProof = null
) {

  if (!id) {

    alert(
      "Transaction ID is missing."
    );

    return;

  }


  const normalizedStatus =
    String(status)
      .toUpperCase();


  if (
    ![
      "VERIFIED",
      "REJECTED"
    ].includes(
      normalizedStatus
    )
  ) {

    alert(
      "Invalid transaction status."
    );

    return;

  }


  try {

    const confirmed =
      window.confirm(
        `Are you sure you want to ${normalizedStatus.toLowerCase()} this transaction?`
      );


    if (!confirmed) return;

    

               
    await api(
      "/api/admin/transaction-status", 
      {
        method: "POST",

        body: JSON.stringify({          
            id,
            status: normalizedStatus,
            adminProof: adminProof
              
          })
      }
    );


    await load(
      true
    );

  } catch (error) {

    console.error(
      "Status update error:",
      error
    );


    if (
      !handleAuthError(error)
    ) {

      alert(
        error.message ||
        "Unable to update transaction status."
      );

    }

  }

}


window.setStatus =
  setStatus;


// ============================================================
// LOGIN
// ============================================================

async function handleLogin(event) {

  event.preventDefault();


  if ($("#loginError")) {

    $("#loginError").textContent =
      "";

  }


  const email =
    $("#email")
      ?.value
      ?.trim() || "";


  const password =
    $("#password")
      ?.value || "";


  if (!email || !password) {

    if ($("#loginError")) {

      $("#loginError").textContent =
        "Please enter email and password.";

    }

    return;

  }


  const loginButton =
    $("#loginForm button[type='submit']");


  setButtonLoading(
    loginButton,
    true,
    "Logging in...",
    "Login"
  );


  try {

    await api(
      "/api/login",
      {
        method: "POST",

        body:
          JSON.stringify({
            email,
            password
          })
      }
    );


    await load(
      true
    );

  } catch (error) {

    console.error(
      "Login error:",
      error
    );


    if ($("#loginError")) {

      $("#loginError").textContent =
        error.message ||
        "Invalid email or password.";

    }

  } finally {

    setButtonLoading(
      loginButton,
      false,
      "Logging in...",
      "Login"
    );

  }

}


// ============================================================
// LOGOUT
// ============================================================

async function handleLogout() {

  try {

    await api(
      "/api/logout",
      {
        method: "POST"
      }
    );

  } catch (error) {

    console.error(
      "Logout error:",
      error
    );

  }


  currentUser =
    null;


  currentDashboard =
    null;


  window.location.reload();

}


// ============================================================
// DEPOSIT OPEN
// ============================================================

function openDeposit() {

  const modal =
    $("#modal");


  if (!modal) return;


  modal.hidden =
    false;


  setMessage(
    "#depositMsg",
    ""
  );


  if ($("#amount")) {

    $("#amount").value =
      "";

  }


  if ($("#utrNumber")) {

    $("#utrNumber").value =
      "";

  }


  if ($("#paymentScreenshot")) {

    $("#paymentScreenshot").value =
      "";

  }


  if ($("#fileName")) {

    $("#fileName").textContent =
      "";

  }


  setTimeout(
    () => {

      $("#amount")?.focus();

    },
    50
  );

}


// ============================================================
// DEPOSIT CLOSE
// ============================================================

function closeDeposit() {

  const modal =
    $("#modal");


  if (modal) {

    modal.hidden =
      true;

  }

}


// ============================================================
// FILE NAME
// ============================================================

function handleScreenshotChange() {

  const file =
    $("#paymentScreenshot")
      ?.files?.[0];


  if ($("#fileName")) {

    $("#fileName").textContent =
      file
        ? `Selected: ${file.name}`
        : "";

  }

}


// ============================================================
// DEPOSIT SUBMIT
// ============================================================

async function handleDeposit(event) {

  event.preventDefault();


  const msg =
    $("#depositMsg");


  if (!msg) return;


  msg.textContent =
    "";


  const amount =
    Number(
      $("#amount")
        ?.value
        ?.trim()
    );


  const utrNumber =
    $("#utrNumber")
      ?.value
      ?.trim() || "";


  const file =
    $("#paymentScreenshot")
      ?.files?.[0];


  if (!Number.isFinite(amount) || amount < 10000) {
    msg.textContent = "Minimum deposit is ₹10,000.";
    return;
  }


  if (amount > 100000000) {

    msg.textContent =
      "Enter a valid deposit amount.";

    return;

  }


  if (!utrNumber) {

    msg.textContent =
      "UTR / Transaction Number is required.";

    return;

  }


  if (utrNumber.length > 100) {

    msg.textContent =
      "UTR / Transaction Number is too long.";

    return;

  }


  if (!file) {

    msg.textContent =
      "Please upload your payment screenshot.";

    return;

  }


  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/webp"
  ];


  if (
    !allowedTypes.includes(
      file.type
    )
  ) {

    msg.textContent =
      "Only JPG, PNG or WEBP images are allowed.";

    return;

  }


  if (
    file.size >
    5 * 1024 * 1024
  ) {

    msg.textContent =
      "Payment screenshot must be 5 MB or smaller.";

    return;

  }


  const submitButton =
    $("#depositForm button[type='submit']");


  setButtonLoading(
    submitButton,
    true,
    "Submitting...",
    "Submit Deposit"
  );


  try {

    const formData =
      new FormData();


    formData.append(
      "amount",
      String(amount)
    );


    formData.append(
      "utrNumber",
      utrNumber
    );


    formData.append(
      "paymentScreenshot",
      file
    );


    await apiFormData(
      "/api/deposit-request",
      formData
    );


    msg.textContent =
      "Deposit request submitted successfully for admin verification.";


    setTimeout(
      async () => {

        closeDeposit();

        await load(
          true
        );

      },
      1000
    );


  } catch (error) {

    console.error(
      "Deposit error:",
      error
    );


    if (
      !handleAuthError(error)
    ) {

      msg.textContent =
        error.message ||
        "Unable to submit deposit request.";

    }

  } finally {

    setButtonLoading(
      submitButton,
      false,
      "Submitting...",
      "Submit Deposit"
    );

  }

}






// ============================================================
// WITHDRAWAL OPEN
// ============================================================

async function openWithdrawal() {

  const modal = $("#withdrawalModal");

  if (!modal) return;

  modal.hidden = false;

  setMessage("#withdrawalMsg", "");

  if ($("#withdrawalAmount")) {
    $("#withdrawalAmount").value = "";
  }

  // Load bank accounts into withdrawal dropdown
  await loadWithdrawalBankAccounts();

  setTimeout(() => {
    $("#withdrawalAmount")?.focus();
  }, 100);

}


// ============================================================
// LOAD BANK ACCOUNTS FOR WITHDRAWAL
// ============================================================

async function loadWithdrawalBankAccounts() {

  const select =
    $("#withdrawalBankAccount");

  if (!select) {

    console.warn(
      "withdrawalBankAccount select not found."
    );

    return;

  }


  select.innerHTML = `
    <option value="">
      Loading bank accounts...
    </option>
  `;


  select.disabled = true;


  try {

    const data =
      await api(
        "/api/bank-accounts"
      );


    const accountsRaw =
      Array.isArray(data?.accounts)
        ? data.accounts
        : Array.isArray(data?.bankAccounts)
          ? data.bankAccounts
          : [];

    const accounts = accountsRaw.filter(a => String(a.status || 'VERIFIED').toUpperCase() === 'VERIFIED');


    // ========================================================
    // NO BANK ACCOUNT
    // ========================================================

    if (accounts.length === 0) {

      select.innerHTML = `
        <option value="">
          No bank account added
        </option>
      `;

      select.disabled = true;

      const msg =
        $("#withdrawalMsg");

      if (msg) {

        msg.textContent =
          "Please add a bank account before requesting withdrawal.";

      }

      return;

    }


    // ========================================================
    // BANK ACCOUNT OPTIONS
    // ========================================================

    select.innerHTML = `
      <option value="">
        Select bank account
      </option>
    `;


    accounts.forEach(
      (account, index) => {

        const bankName =
          account?.bankName ||
          account?.bank ||
          "Bank Account";


        const holder =
          account?.accountHolderName ||
          account?.accountHolder ||
          account?.holderName ||
          "";


        const accountNumber =
          account?.accountNumber ||
          account?.accountNumberMasked ||
          account?.maskedAccountNumber ||
          "";


        const maskedNumber =
          account?.accountNumberMasked ||
          account?.maskedAccountNumber ||
          maskAccountNumber(
            accountNumber
          );


        const ifsc =
          account?.ifsc ||
          account?.IFSC ||
          "";


        /*
          IMPORTANT:
          Different backends may use different ID fields.
        */

        const accountId =
          account?.id ||
          account?._id ||
          account?.bankAccountId ||
          account?.accountId;


        if (!accountId) {

          console.warn(
            "Bank account has no ID:",
            account
          );

          return;

        }


        const option =
          document.createElement(
            "option"
          );


        option.value =
          String(accountId);


        option.textContent =
          account.method === "UPI"
            ? `UPI • ${account.upiId || ""}`
            : `${bankName} • ${maskedNumber}${ifsc ? ` • ${ifsc}` : ""}`;


        /*
          Store useful information
          for possible future use.
        */

        option.dataset.bankName =
          bankName;

        option.dataset.accountNumber =
          maskedNumber;

        option.dataset.ifsc =
          ifsc;

        option.dataset.holder =
          holder;


        select.appendChild(
          option
        );

      }
    );


    select.disabled = false;


    // ========================================================
    // SHOW SELECTED BANK DETAILS
    // ========================================================

    select.onchange = () => {

      showSelectedWithdrawalBank();

    };


  } catch (error) {

    console.error(
      "Withdrawal bank accounts error:",
      error
    );


    select.innerHTML = `
      <option value="">
        Unable to load bank accounts
      </option>
    `;


    select.disabled = true;


    const msg =
      $("#withdrawalMsg");


    if (
      msg &&
      !handleAuthError(error)
    ) {

      msg.textContent =
        error.message ||
        "Unable to load bank accounts.";

    }

  }

}


// ============================================================
// SHOW SELECTED WITHDRAWAL BANK
// ============================================================

function showSelectedWithdrawalBank() {

  const select =
    $("#withdrawalBankAccount");

  const info =
    $("#withdrawalBankInfo");


  if (!select || !info) {

    return;

  }


  const option =
    select.options[
      select.selectedIndex
    ];


  if (
    !option ||
    !select.value
  ) {

    info.hidden = true;

    info.innerHTML = "";

    return;

  }


  const bankName =
    option.dataset.bankName ||
    "Bank Account";


  const accountNumber =
    option.dataset.accountNumber ||
    "—";


  const ifsc =
    option.dataset.ifsc ||
    "—";


  const holder =
    option.dataset.holder ||
    "—";


  info.innerHTML = `

    <div
      style="
        margin-top:12px;
        padding:14px;
        border-radius:12px;
        background:#f6f8fc;
        border:1px solid rgba(0,0,0,.08);
      "
    >

      <strong>
        ${escapeHtml(bankName)}
      </strong>

      <div
        class="muted"
        style="margin-top:6px;"
      >
        Account Holder:
        ${escapeHtml(holder)}
      </div>

      <div
        class="muted"
        style="margin-top:4px;"
      >
        Account Number:
        ${escapeHtml(accountNumber)}
      </div>

      <div
        class="muted"
        style="margin-top:4px;"
      >
        IFSC:
        ${escapeHtml(ifsc)}
      </div>

    </div>

  `;


  info.hidden = false;

}


// ============================================================
// WITHDRAWAL CLOSE
// ============================================================

function closeWithdrawal() {

  const modal =
    $("#withdrawalModal");


  if (modal) {

    modal.hidden = true;

  }


  if ($("#withdrawalBankAccount")) {

    $("#withdrawalBankAccount").value =
      "";

  }


  if ($("#withdrawalBankInfo")) {

    $("#withdrawalBankInfo").hidden =
      true;

    $("#withdrawalBankInfo").innerHTML =
      "";

  }

}


// ============================================================
// WITHDRAWAL SUBMIT
// ============================================================

async function handleWithdrawal(event) {

  event.preventDefault();


  const msg =
    $("#withdrawalMsg");


  if (!msg) return;


  msg.textContent = "";


  const amount =
    Number(
      $("#withdrawalAmount")
        ?.value
        ?.trim()
    );


  const bankAccountId =
    $("#withdrawalBankAccount")
      ?.value
      ?.trim() || "";


  // ==========================================================
  // AMOUNT VALIDATION
  // ==========================================================

  if (
    !Number.isFinite(amount) ||
    amount <= 0
  ) {

    msg.textContent =
      "Enter a valid withdrawal amount.";

    return;

  }


  if (amount > 100000000) {

    msg.textContent =
      "Enter a valid withdrawal amount.";

    return;

  }


  // ==========================================================
  // BANK ACCOUNT VALIDATION
  // ==========================================================

  if (!bankAccountId) {

    msg.textContent =
      "Please select a withdrawal bank account.";

    return;

  }


  const submitButton =
    $("#withdrawalForm button[type='submit']");


  setButtonLoading(
    submitButton,
    true,
    "Submitting...",
    "Submit Withdrawal"
  );


  try {

    await api(
      "/api/withdrawal-request",
      {

        method: "POST",

        headers: {
          "Content-Type":
            "application/json"
        },

        body:
          JSON.stringify({

            amount,

            bankAccountId

          })

      }
    );


    msg.textContent =
      "Withdrawal request submitted for admin verification.";


    setTimeout(
      async () => {

        closeWithdrawal();

        await load(
          true
        );

      },
      1000
    );


  } catch (error) {

    console.error(
      "Withdrawal error:",
      error
    );


    if (
      !handleAuthError(error)
    ) {

      msg.textContent =
        error.message ||
        "Unable to submit withdrawal request.";

    }

  } finally {

    setButtonLoading(
      submitButton,
      false,
      "Submitting...",
      "Submit Withdrawal"
    );

  }

}


// ============================================================
// PAYMENT PROOF
// ============================================================

function viewProof(
  url,
  utrNumber = ""
) {

  if (!url) {

    alert(
      "Payment screenshot not available."
    );

    return;

  }


  const proofModal =
    $("#proofModal");


  const proofImage =
    $("#proofImage");


  if (!proofModal || !proofImage) {

    window.open(
      url,
      "_blank",
      "noopener,noreferrer"
    );

    return;

  }


  proofImage.src =
    url;


  proofImage.alt =
    "Payment proof";


  if ($("#proofUtr")) {

    $("#proofUtr").textContent =
      utrNumber
        ? `UTR / Transaction Number: ${utrNumber}`
        : "Payment Screenshot";

  }


  proofModal.hidden =
    false;


  if ($("#openProofNewTab")) {

    $("#openProofNewTab").onclick =
      () => {

        window.open(
          url,
          "_blank",
          "noopener,noreferrer"
        );

      };

  }

}


window.viewProof =
  viewProof;


// ============================================================
// CLOSE PROOF
// ============================================================

function closeProof() {

  if ($("#proofModal")) {

    $("#proofModal").hidden =
      true;

  }


  if ($("#proofImage")) {

    $("#proofImage").src =
      "";

  }


  if ($("#proofUtr")) {

    $("#proofUtr").textContent =
      "";

  }

}



// ============================================================
// PHASE 3 INVESTOR / ADMIN PAGES
// ============================================================

function pageTransactions(type) {
  const all = Array.isArray(currentDashboard?.transactions) ? currentDashboard.transactions : [];
  return type ? all.filter(t => String(t.type || '').toUpperCase() === type) : all;
}

function statusClass(status) {
  const s = String(status || '').toUpperCase();
  return s === 'VERIFIED' ? 'status-approved' : s === 'REJECTED' ? 'status-rejected' : 'status-pending';
}

function timeOnly(value) {
  if (!value) return '—';
  return new Date(value).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
}

function formatLevelIncomeDate(value) {
  const raw = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return String(value || '—');
  const [y, m, d] = raw.split('-');
  return `${d}-${m}-${y}`;
}

function buildLevelIncomeDailySummary(ledger) {
  const byDate = new Map();

  for (const entry of (Array.isArray(ledger) ? ledger : [])) {
    const date = String(entry?.date || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    const amount = Number(entry?.amount || 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;

    const level = Number(entry?.level || 0);
    const row = byDate.get(date) || { date, aIncome: 0, bIncome: 0, cIncome: 0 };

    if (level === 1) row.aIncome += amount;
    else if (level === 2) row.bIncome += amount;
    else if (level >= 3) row.cIncome += amount;

    byDate.set(date, row);
  }

  return Array.from(byDate.values())
    .map(row => ({
      ...row,
      dailyTotal: row.aIncome + row.bIncome + row.cIncome
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

function renderInvestorTargetPanel(user) {
  const el = $('#investorTargetPanel');
  if (!el || !user || isAdminUser(user)) return;
  const tx = Array.isArray(currentDashboard?.transactions) ? currentDashboard.transactions : [];
  const qualifying = tx.filter(t => ['WITHDRAWAL','LEVEL_INCOME_WITHDRAWAL'].includes(String(t.type || '').toUpperCase()) && getTransactionStatus(t) === 'VERIFIED');
  const deposits = tx.filter(t => String(t.type || '').toUpperCase() === 'DEPOSIT' && getTransactionStatus(t) === 'VERIFIED');
  const depositTotal = Number((deposits.reduce((sum,t)=>sum+Number(t.amount||0),0)).toFixed(2));
  const target = Number((depositTotal * 2).toFixed(2));
  const withdrawn = Number((qualifying.reduce((sum,t)=>sum+Number(t.amount||0),0)).toFixed(2));
  const remaining = Math.max(0, Number((target-withdrawn).toFixed(2)));
  const achieved = target > 0 && withdrawn >= target;
  const pct = target > 0 ? Math.min(100, withdrawn / target * 100) : 0;
  const list = qualifying.slice().sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||'')));
  el.hidden = false;
  el.innerHTML = `
    <div class="target-head"><div><div class="target-label">Target Achieved</div><h3>${achieved ? '🎯 Target Achieved — Account Closed' : '🎯 Target Progress'}</h3></div><span class="target-status ${achieved ? 'achieved' : 'running'}">${achieved ? 'ACHIEVED' : 'IN PROGRESS'}</span></div>
    <div class="target-summary-grid">
      <div><span>Total Verified Deposits</span><strong>${fmt(depositTotal)}</strong></div>
      <div><span>Target (2× Deposits)</span><strong>${fmt(target)}</strong></div>
      <div><span>Eligible Withdrawals</span><strong>${fmt(withdrawn)}</strong><small>ROI + Level Income</small></div>
      <div><span>${achieved ? 'Target Completed' : 'Still Needed'}</span><strong>${fmt(remaining)}</strong><small>${achieved ? 'Account is closed' : 'to complete target'}</small></div>
    </div>
    <div class="target-progress"><div class="target-progress-bar"><span style="width:${pct.toFixed(2)}%"></span></div><div class="target-progress-text"><span>${fmt(withdrawn)} withdrawn</span><b>${pct.toFixed(1)}%</b><span>${fmt(target)} target</span></div></div>
    <div class="target-withdrawals"><div class="target-withdrawals-title">Withdrawal Amounts counted toward Target</div>${list.length ? `<div class="target-withdrawal-list">${list.map(t=>`<div class="target-withdrawal-row"><span class="target-w-type">${String(t.type).toUpperCase()==='WITHDRAWAL' ? 'ROI Withdrawal' : 'Level Income'}</span><strong>${fmt(t.amount)}</strong><small>${escapeHtml(formatDate(t.createdAt || t.date))}</small></div>`).join('')}</div>` : '<div class="target-empty">No eligible withdrawals yet.</div>'}</div>
    <div class="target-note">Cash Back withdrawals are <b>not</b> included in this target calculation.</div>
  `;
}

function renderInvestorTierPanel(user) {
  const panel = $('#investorTierPanel');
  if (!panel || !user || user.role !== 'investor') return;
  const t = user.tierData || {};
  const s = t.silver || {};
  const g = t.gold || {};
  const pct = (v, target) => Math.min(100, Math.round(Number(v || 0) / Math.max(1, Number(target || 1)) * 100));
  const remaining = (v, target) => Math.max(0, Number(target || 0) - Number(v || 0));
  const route = (label, value, target) => `<div class="tier-route"><div class="tier-route-head"><span>${label}</span><b>${fmt(value)}</b></div><div class="progress"><span style="width:${pct(value,target)}%"></span></div><small>${fmt(value)} / ${fmt(target)} · ${remaining(value,target) > 0 ? `${fmt(remaining(value,target))} more needed` : 'Eligible'}</small></div>`;
  const statusNote = user.tier === 'Gold'
    ? 'Gold eligibility achieved.'
    : user.tier === 'Silver'
      ? 'Silver eligibility achieved. Gold progress is shown below.'
      : 'Complete any one route to qualify for the corresponding status.';
  const silverEligible = Number(s.l1 || 0) >= Number(s.l1Target || 200000) || Number(s.l12 || 0) >= Number(s.l12Target || 400000) || Number(s.l123 || 0) >= Number(s.l123Target || 500000);
  const goldEligible = Number(g.l1 || 0) >= Number(g.l1Target || 500000) || Number(g.l12 || 0) >= Number(g.l12Target || 700000) || Number(g.l123 || 0) >= Number(g.l123Target || 1000000);
  panel.innerHTML = `<div class="tier-card tier-${String(user.tier || 'normal').toLowerCase()}">
    <div class="tier-top"><div><div class="tier-label">Investor Status</div><div class="tier-name">${escapeHtml(user.tier || 'Normal')}</div></div><div class="tier-meta">ROI: <b>${Number(user.roiRate || 1)}%</b> · Withdrawal Commission: <b>${Number(user.withdrawalCommissionRate || 0)}%</b></div></div>
    <div class="tier-note">${statusNote}</div>
    <div class="tier-business-grid">
      <div class="tier-business-card"><div class="tier-business-title">🥈 Silver Eligibility ${silverEligible ? '<span class="tier-badge">ELIGIBLE</span>' : ''}</div>
        ${route('Level 1', s.l1 || 0, s.l1Target || 200000)}
        ${route('Level 1 + Level 2', s.l12 || 0, s.l12Target || 400000)}
        ${route('Level 1 + 2 + 3', s.l123 || 0, s.l123Target || 500000)}
        <div class="tier-level-breakdown"><span>L1: <b>${fmt(s.l1 || 0)}</b></span><span>L2: <b>${fmt(s.l2 || 0)}</b></span><span>L3: <b>${fmt(s.l3 || 0)}</b></span></div>
      </div>
      <div class="tier-business-card"><div class="tier-business-title">🥇 Gold Eligibility ${goldEligible ? '<span class="tier-badge">ELIGIBLE</span>' : ''}</div>
        ${route('Level 1', g.l1 || 0, g.l1Target || 500000)}
        ${route('Level 1 + Level 2', g.l12 || 0, g.l12Target || 700000)}
        ${route('Level 1 + 2 + 3', g.l123 || 0, g.l123Target || 1000000)}
        <div class="tier-level-breakdown"><span>L1: <b>${fmt(g.l1 || 0)}</b></span><span>L2: <b>${fmt(g.l2 || 0)}</b></span><span>L3: <b>${fmt(g.l3 || 0)}</b></span></div>
      </div>
    </div>
  </div>`;
}

function renderRulesPage() {
  const el = $('#rulesContent');
  if (!el) return;

  el.innerHTML = `
    <div class="rules-grid">
      <div class="rule-card">
        <h3>🟢 Normal Status</h3>
        <p>Normal ROI: <b>1%</b> per working day (Monday–Friday).</p>
        <p>ROI compounds on the updated balance when it remains in the account.</p>
        <p>Normal withdrawal company commission: <b>10%</b>.</p>
      </div>
      <div class="rule-card">
        <h3>🥈 Silver Status</h3>
        <p>ROI: <b>1%</b> per working day.</p>
        <p>Withdrawal company commission: <b>5%</b>.</p>
        <p>Eligibility: Level 1 ₹2,00,000 OR Level 1 + 2 ₹4,00,000 OR Level 1 + 2 + 3 ₹5,00,000.</p>
      </div>
      <div class="rule-card">
        <h3>🥇 Gold Status</h3>
        <p>Gold remains the higher status already configured in SPARTNER.</p>
        <p>Eligibility: Level 1 ₹5,00,000 OR Level 1 + 2 ₹7,00,000 OR Level 1 + 2 + 3 ₹10,00,000.</p>
        <p>Gold benefits are shown in the investor status panel.</p>
      </div>
      <div class="rule-card">
        <h3>👥 Level Income</h3>
        <p>Maximum network depth: <b>5 levels</b>.</p>
        <p>Each sponsor can have a maximum of <b>5 direct IDs</b> in each branch.</p>
        <p>Normal Level Income is based on the downline member's <b>ROI</b>, not the deposit.</p>
        <p>L1 <b>10%</b> · L2 <b>10%</b> · L3 <b>7%</b> · L4 <b>5%</b> · L5 <b>3%</b>.</p>
        <p>Level Income is generated when the member's weekday ROI is credited.</p>
      </div>
      <div class="rule-card">
        <h3>💸 Level Income Withdrawal</h3>
        <p>Allowed only on <b>Friday, Saturday and Sunday</b>.</p>
        <p>Time: <b>4:30 PM – 11:30 PM IST</b>.</p>
      </div>
      <div class="rule-card">
        <h3>💰 Cash Back</h3>
        <p>Verified deposits receive <b>5% Cash Back</b>.</p>
        <p>Cash Back withdrawals are allowed on <b>Monday only</b>.</p>
        <p>Cash Back withdrawals do <b>not</b> count toward the 2× target.</p>
      </div>
      <div class="rule-card">
        <h3>🎯 Target Achieved</h3>
        <p>Target = <b>2× total verified deposits</b>.</p>
        <p>Verified <b>ROI withdrawals + Level Income withdrawals</b> count toward the target.</p>
        <p>Cash Back withdrawals are excluded.</p>
        <p>When the target is reached, the investor account becomes <b>Target Achieved / Closed</b>.</p>
      </div>
      <div class="rule-card">
        <h3>📥 Deposits & Withdrawals</h3>
        <p>Multiple verified deposits are added to the investor's total verified deposit.</p>
        <p>Each deposit and withdrawal remains separately visible with date/time, status and proof where applicable.</p>
      </div>
      <div class="rule-card">
        <h3>🔐 Account Security</h3>
        <p>Admin and Investors can change their password after login from <b>Profile → Change Password</b>.</p>
        <p><b>Forgot Password</b> is available from the login screen for both account types when email recovery is configured.</p>
      </div>
      <div class="rule-card">
        <h3>📊 History & Reports</h3>
        <p>ROI History, Level Income, Cash Back, Deposits, Withdrawals and Transactions remain available for reference.</p>
        <p>Available balances reduce after verified withdrawals, while cumulative earned totals remain visible separately.</p>
      </div>
    </div>
  `;
}

function getDownlineCommissionMap() {
  const map = new Map();
  const ledger = Array.isArray(currentUser?.levelIncomeLedger) ? currentUser.levelIncomeLedger : [];
  for (const entry of ledger) {
    const id = String(entry?.sourceUserId || '');
    if (!id) continue;
    map.set(id, Number(((map.get(id) || 0) + Number(entry.amount || 0)).toFixed(2)));
  }
  return map;
}

function renderMyDownlinesMap() {
  const root = $('#myDownlineMap');
  if (!root || !currentUser || isAdminUser(currentUser)) return;

  const members = Array.isArray(currentUser.downlineDetails) ? currentUser.downlineDetails : [];
  const byId = new Map(members.map(member => [String(member.id), member]));
  const children = new Map();
  for (const member of members) {
    const parentId = String(member.sponsorId || '');
    if (!children.has(parentId)) children.set(parentId, []);
    children.get(parentId).push(member);
  }
  for (const list of children.values()) {
    list.sort((a, b) => String(a.id || '').localeCompare(String(b.id || ''), undefined, { numeric: true }));
  }

  const direct = children.get(String(currentUser.id)) || [];
  if (!direct.length) {
    root.innerHTML = '<div class="downline-empty"><div class="downline-empty-icon">👥</div><b>No downline members yet.</b><span>Add direct investors to see your 5-level downline map.</span></div>';
    return;
  }

  const commissionMap = getDownlineCommissionMap();
  // Start with only Level-1 members visible. Click an investor node to reveal/hide that investor's direct downline.
  const expanded = new Set();

  const nodeHtml = (member, level) => {
    const id = String(member.id || '');
    const kids = children.get(id) || [];
    const hasKids = kids.length > 0;
    const amount = Number(commissionMap.get(id) || 0);
    const status = level === 1 ? 'Direct' : `Level ${level}`;
    const initial = escapeHtml(String(member.name || id || '?').trim().charAt(0).toUpperCase());
    return `<div class="downline-branch" data-node-id="${escapeHtml(id)}">
      <button type="button" class="downline-node level-${level}" data-downline-node="${escapeHtml(id)}" aria-expanded="${hasKids ? expanded.has(id) : 'false'}">
        <span class="downline-avatar">${initial}</span>
        <span class="downline-node-info"><strong>${escapeHtml(id)}</strong><small>${escapeHtml(member.name || 'Investor')} · ${status}</small></span>
        <span class="downline-commission"><b>${fmt(amount)}</b><small>your commission</small></span>
        ${hasKids ? `<span class="downline-toggle">${expanded.has(id) ? '−' : '+'}</span>` : '<span class="downline-leaf">•</span>'}
      </button>
      ${hasKids ? `<div class="downline-children" data-children-for="${escapeHtml(id)}" ${expanded.has(id) ? '' : 'hidden'}>${kids.slice(0,5).map(child => nodeHtml(child, Math.min(5, level + 1))).join('')}</div>` : ''}
    </div>`;
  };

  root.innerHTML = `<div class="downline-root-card"><div class="downline-root-node"><span class="downline-avatar root-avatar">${escapeHtml(String(currentUser.name || currentUser.id || '?').trim().charAt(0).toUpperCase())}</span><span class="downline-node-info"><strong>${escapeHtml(currentUser.id || '')}</strong><small>${escapeHtml(currentUser.name || 'Investor')} · You</small></span><span class="downline-root-label">YOUR ACCOUNT</span></div><div class="downline-root-line"></div><div class="downline-children root-children">${direct.slice(0,5).map(member => nodeHtml(member, 1)).join('')}</div></div>`;

  root.querySelectorAll('[data-downline-node]').forEach(button => {
    button.addEventListener('click', () => {
      const id = String(button.dataset.downlineNode || '');
      const childBox = root.querySelector(`[data-children-for="${CSS.escape(id)}"]`);
      if (!childBox) return;
      const isHidden = childBox.hidden;
      childBox.hidden = !isHidden;
      button.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
      const toggle = button.querySelector('.downline-toggle');
      if (toggle) toggle.textContent = isHidden ? '−' : '+';
    });
  });
}

function renderInvestorSpecialPages() {
  if (!currentUser || isAdminUser(currentUser)) return;
  renderMyDownlinesMap();

  $('#openCashbackWithdrawBtn')?.removeAttribute('hidden');
  const cashbackHeader = $('#cashbackBody')?.closest('table')?.querySelector('thead tr');
  if (cashbackHeader) cashbackHeader.innerHTML = '<th>Deposit</th><th>Cash Back</th><th>Date</th>';
  $('#openLevelIncomeWithdrawBtn')?.removeAttribute('hidden');
  const levelSection = $('#section-level-incomes');
  $('#adminLevelLegacyDownlineSection')?.removeAttribute('hidden');
  if (levelSection) {
    const levelHeader = $('#levelIncomeBody')?.closest('table')?.querySelector('thead tr');
    if (levelHeader) levelHeader.innerHTML = '<th>Date</th><th>A Income</th><th>B Income</th><th>C Income</th><th>Daily Total</th>';
    const h3s = levelSection.querySelectorAll('h3');
    if (h3s[0]) h3s[0].textContent = 'My Downline Members';
    if (h3s[1]) h3s[1].textContent = 'Downline Level Income Details';
    if (h3s[2]) h3s[2].textContent = 'Level Income Withdrawals';
  }

  const tx = Array.isArray(currentDashboard?.transactions) ? currentDashboard.transactions : [];
  const deposits = tx.filter(t => String(t.type || '').toUpperCase() === 'DEPOSIT');
  const withdrawals = tx.filter(t => String(t.type || '').toUpperCase() === 'WITHDRAWAL');

  if ($('#depositPageBody')) {
    $('#depositPageBody').innerHTML = deposits.length ? deposits.map(t => `
      <tr>
        <td><strong>${fmt(t.amount)}</strong></td>
        <td>${escapeHtml(formatDate(t.createdAt || t.date))}</td>
        <td>${escapeHtml(timeOnly(t.createdAt))}</td>
        <td class="${statusClass(getTransactionStatus(t))}">${escapeHtml(getTransactionStatus(t))}</td>
        <td>${t.paymentScreenshot ? `<button class="mini" type="button" onclick="viewProof('${escapeHtml(t.paymentScreenshot)}','${escapeHtml(t.utrNumber || '')}')">View</button>` : '—'}</td>
      </tr>`).join('') : '<tr><td colspan="5">No deposits yet.</td></tr>';
  }

  if ($('#withdrawPageBody')) {
    $('#withdrawPageBody').innerHTML = withdrawals.length ? withdrawals.map(t => `
      <tr>
        <td><strong>${fmt(t.amount)}</strong></td>
        <td>${fmt(t.companyCommission || 0)} (${fmt(t.companyCommissionRate || 0)}%)</td>
        <td><strong>${fmt(t.netAmount ?? t.amount)}</strong></td>
        <td>${escapeHtml(formatDate(t.createdAt || t.date))}</td>
        <td class="${statusClass(getTransactionStatus(t))}">${escapeHtml(getTransactionStatus(t))}</td>
        <td>${t.adminProof?.data ? `<button class="mini" type="button" onclick="viewProof('${escapeHtml(t.adminProof.data)}','')">View</button>` : '—'}</td>
      </tr>`).join('') : '<tr><td colspan="6">No withdrawals yet.</td></tr>';
  }

  if ($('#withdrawAvailablePage')) $('#withdrawAvailablePage').textContent = fmt(currentUser.withdrawalAllowance || 0);

  const cashback = currentUser.cashbackRecords || [];
  if ($('#cashbackAvailable')) $('#cashbackAvailable').textContent = fmt(currentUser.cashbackAvailable || 0);
  if ($('#cashbackBody')) $('#cashbackBody').innerHTML = cashback.length ? cashback.map(x => `
    <tr><td>${fmt(x.amount)}</td><td><strong>${fmt(x.cashback)}</strong></td><td>${escapeHtml(formatDate(x.date))}</td></tr>
  `).join('') : '<tr><td colspan="3">No cash back yet.</td></tr>';

  const cbw = tx.filter(t => String(t.type || '').toUpperCase() === 'CASHBACK_WITHDRAWAL');
  if ($('#cashbackWithdrawBody')) $('#cashbackWithdrawBody').innerHTML = cbw.length ? cbw.map(t => `
    <tr><td>${fmt(t.amount)}</td><td>${escapeHtml(formatDate(t.createdAt || t.date))}</td><td>${escapeHtml(timeOnly(t.createdAt))}</td>
    <td class="${statusClass(t.status)}">${escapeHtml(t.status || '')}</td><td>${t.adminProof?.data ? `<button class="mini" onclick="viewProof('${escapeHtml(t.adminProof.data)}','')">View</button>` : '—'}</td></tr>
  `).join('') : '<tr><td colspan="5">No requests yet.</td></tr>';

  const ledger = currentUser.levelIncomeLedger || [];
  const dailyLevelIncome = buildLevelIncomeDailySummary(ledger);
  if ($('#levelIncomeAvailable')) $('#levelIncomeAvailable').textContent = fmt(currentUser.levelIncomeBalance || 0);
  if ($('#levelIncomeBody')) $('#levelIncomeBody').innerHTML = dailyLevelIncome.length ? dailyLevelIncome.map(x => `
    <tr><td>${escapeHtml(formatLevelIncomeDate(x.date))}</td><td>${fmt(x.aIncome)}</td><td>${fmt(x.bIncome)}</td><td>${fmt(x.cIncome)}</td><td><strong>${fmt(x.dailyTotal)}</strong></td></tr>
  `).join('') : '<tr><td colspan="5">No level income yet.</td></tr>';

  const downlineDetails = Array.isArray(currentUser.downlineDetails) ? currentUser.downlineDetails : [];
  const directDownline = downlineDetails.filter(x => Number(x.level) === 1);
  const directCount = directDownline.length;
  if ($('#levelDirectDownlineCount')) $('#levelDirectDownlineCount').textContent = directCount;
  if ($('#levelTotalDownlineCount')) $('#levelTotalDownlineCount').textContent = downlineDetails.length;
  if ($('#directDownlineList')) $('#directDownlineList').innerHTML = directDownline.length ? directDownline.map(x => `
    <div class="direct-downline-item">
      <div class="direct-downline-main"><div class="direct-downline-name">${escapeHtml(x.name || '—')}</div><div class="direct-downline-id">${escapeHtml(x.id || '—')} · Level 1</div></div>
      <div class="direct-downline-deposit">${fmt(x.totalInvestment || 0)}</div>
    </div>`).join('') : '<div class="direct-downline-empty">No direct downline members yet.</div>';
  if ($('#levelDownlineBody')) $('#levelDownlineBody').innerHTML = downlineDetails.length ? downlineDetails.map(x => `
    <tr><td>${escapeHtml(String(x.level))}</td><td><strong>${escapeHtml(x.id || '—')}</strong></td><td>${escapeHtml(x.name || '—')}</td><td>${escapeHtml(x.joinedAt ? formatLevelIncomeDate(x.joinedAt) : '—')}</td><td>${fmt(x.totalInvestment || 0)}</td><td><strong>${fmt(x.levelIncomeGenerated || 0)}</strong></td></tr>
  `).join('') : '<tr><td colspan="6">No downline members yet.</td></tr>';

  const incomeDetailRows = [];
  for (const member of downlineDetails) {
    for (const entry of (Array.isArray(member.incomeHistory) ? member.incomeHistory : [])) {
      incomeDetailRows.push({ member, entry });
    }
  }

  // Show downline income date-by-date, with all members for the same date
  // together (e.g. 07-09: INV002, INV003, INV004, INV005).
  incomeDetailRows.sort((a, b) => {
    const dateA = String(a.entry?.date || '').slice(0, 10);
    const dateB = String(b.entry?.date || '').slice(0, 10);
    const dateCompare = dateA.localeCompare(dateB);
    if (dateCompare !== 0) return dateCompare;

    const levelA = Number(a.entry?.level || a.member?.level || 0);
    const levelB = Number(b.entry?.level || b.member?.level || 0);
    if (levelA !== levelB) return levelA - levelB;

    return String(a.member?.id || '').localeCompare(String(b.member?.id || ''), undefined, { numeric: true });
  });

  if ($('#levelDownlineIncomeBody')) $('#levelDownlineIncomeBody').innerHTML = incomeDetailRows.length ? incomeDetailRows.map(({member, entry}) => `
    <tr><td>${escapeHtml(formatLevelIncomeDate(entry.date))}</td><td>${escapeHtml(String(entry.level || member.level))}</td><td><strong>${escapeHtml(member.id || '—')}</strong></td><td>${escapeHtml(member.name || '—')}</td><td>${fmt(member.totalInvestment || 0)}</td><td>${fmt(entry.sourceROI || 0)}</td><td>${fmt(entry.rate || 0)}%</td><td><strong>${fmt(entry.amount || 0)}</strong></td></tr>
  `).join('') : '<tr><td colspan="8">No downline Level Income yet.</td></tr>';

  const liw = tx.filter(t => String(t.type || '').toUpperCase() === 'LEVEL_INCOME_WITHDRAWAL');
  if ($('#levelIncomeWithdrawBody')) $('#levelIncomeWithdrawBody').innerHTML = liw.length ? liw.map(t => `
    <tr><td>${fmt(t.amount)}</td><td>${escapeHtml(formatDate(t.createdAt || t.date))}</td><td>${escapeHtml(timeOnly(t.createdAt))}</td>
    <td class="${statusClass(t.status)}">${escapeHtml(t.status || '')}</td><td>${t.adminProof?.data ? `<button class="mini" onclick="viewProof('${escapeHtml(t.adminProof.data)}','')">View</button>` : '—'}</td></tr>
  `).join('') : '<tr><td colspan="5">No requests yet.</td></tr>';

  const next = currentUser.levelIncomeNextWithdrawAt ? new Date(currentUser.levelIncomeNextWithdrawAt) : null;
  if ($('#levelIncomeNext')) $('#levelIncomeNext').textContent = next && Date.now() < next.getTime() ? next.toLocaleDateString('en-IN') : 'Available';

  // Level Income withdrawal window is always evaluated in India Standard Time (IST),
  // regardless of the investor device/browser timezone.
  const now = new Date();
  const istParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).formatToParts(now);
  const istWeekday = istParts.find(p => p.type === 'weekday')?.value || '';
  const istHour = Number(istParts.find(p => p.type === 'hour')?.value || 0);
  const istMinute = Number(istParts.find(p => p.type === 'minute')?.value || 0);
  const istMinutes = istHour * 60 + istMinute;
  const open = ['Fri','Sat','Sun'].includes(istWeekday) && istMinutes >= 16*60+30 && istMinutes <= 23*60+30;
  if ($('#withdrawWindowPage')) $('#withdrawWindowPage').textContent = 'Normal ROI withdrawals: Monday–Friday, 4:30 PM–11:30 PM IST. Level Income withdrawals: Friday–Sunday, 4:30 PM–11:30 PM IST.';
  if ($('#levelIncomeWindowPage')) $('#levelIncomeWindowPage').textContent = open ? 'Level Income withdrawal window is OPEN (Friday–Sunday, 4:30 PM–11:30 PM IST).' : 'Level Income withdrawals are available Friday–Sunday, 4:30 PM–11:30 PM IST only.';
  if ($('#openLevelIncomeWithdrawBtn')) {
    const cooldown = currentUser.levelIncomeNextWithdrawAt ? new Date(currentUser.levelIncomeNextWithdrawAt) : null;
    const cooldownOpen = !cooldown || Date.now() >= cooldown.getTime();
    $('#openLevelIncomeWithdrawBtn').disabled = !open || !cooldownOpen || Boolean(currentUser.targetAchieved);
    $('#openLevelIncomeWithdrawBtn').title = !open ? 'Level Income withdrawals are available Friday–Sunday, 4:30 PM–11:30 PM IST.' : (!cooldownOpen ? `Next withdrawal available after ${cooldown.toLocaleDateString('en-IN')}` : '');
  }
}

async function loadPhase3Data() {
  try {
    const data = await api('/api/investor/cashback-levels');
    if (currentUser && !isAdminUser(currentUser)) {
      currentUser.cashbackRecords = data.cashbackRecords || [];
      currentUser.cashbackAvailable = data.cashbackAvailable || 0;

      currentUser.levelIncomeTotal = data.levelIncomeTotal || 0;
      currentUser.levelIncomeBalance = data.levelIncomeBalance || 0;
      currentUser.levelIncomeLedger = data.levelIncomeLedger || [];
      currentUser.levelIncomeNextWithdrawAt = data.levelIncomeNextWithdrawAt || null;
      currentUser.downlineDetails = data.downlineDetails || [];
      currentUser.targetAchieved = Boolean(data.targetAchieved);
      currentUser.targetDepositTotal = Number(data.targetDepositTotal || 0);
      currentUser.targetAmount = Number(data.targetAmount || 0);
      currentUser.targetWithdrawn = Number(data.targetWithdrawn || 0);
      currentUser.targetRemaining = Number(data.targetRemaining || 0);
      currentUser.targetWithdrawals = data.targetWithdrawals || [];
    }
  } catch (e) { console.warn('Phase 3 data load:', e.message); }
  renderInvestorSpecialPages();
}

async function submitSpecialWithdrawal(type) {
  const label = type === 'cashback' ? 'Cash Back' : 'Level Income';
  const available = type === 'cashback' ? Number(currentUser.cashbackAvailable || 0) : Number(currentUser.levelIncomeBalance || 0);
  const amountText = prompt(`${label} withdrawal amount (Available ₹${available.toLocaleString('en-IN')}):`);
  if (amountText === null) return;
  const amount = Number(amountText);
  if (!Number.isFinite(amount) || amount <= 0 || amount > available) { alert('Enter a valid amount within available balance.'); return; }
  try {
    const endpoint = type === 'cashback' ? '/api/cashback-withdrawal-request' : '/api/level-income-withdrawal-request';
    const result = await api(endpoint, { method:'POST', body: JSON.stringify({ amount }) });
    alert(result.message || 'Request submitted');
    await load(false);
    await loadPhase3Data();
  } catch (e) { alert(e.message || 'Unable to submit request'); }
}

async function loadAdminPhase3Data() {
  if (!isAdminUser(currentUser)) return;
  // Reuse transaction data for admin request tables; investor summary is loaded on Investors page.
}

async function loadAdminInvestorsPhase3() {
  const body = $('#adminInvestorBody');
  try {
    const data = await api('/api/admin/investors');
    adminInvestorRecords = data.investors || [];
    if (!body) return;
    body.innerHTML = adminInvestorRecords.length ? adminInvestorRecords.map(inv => `
      <tr class="admin-investor-row" data-admin-investor="${escapeHtml(inv.id)}" style="cursor:pointer">
        <td><strong>${escapeHtml(inv.id)}</strong></td><td>${escapeHtml(inv.name)}</td><td>${fmt(inv.totalDeposit)}</td><td>${fmt(inv.roi)}</td><td>${fmt(inv.availableToWithdraw)}</td><td>${fmt(inv.cashBack)}</td><td>${fmt(inv.levelIncome)}</td>
      </tr>
      <tr id="admin-detail-${escapeHtml(inv.id)}" class="admin-detail-row" hidden><td colspan="7"><div class="table-wrap"><table class="admin-detail-table"><thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>ROI</th><th>Cash Back</th><th>Level Income</th><th>Status</th><th>Time</th></tr></thead><tbody id="admin-detail-body-${escapeHtml(inv.id)}"><tr><td colspan="8">Loading...</td></tr></tbody></table></div></td></tr>`).join('') : '<tr><td colspan="7">No investors found.</td></tr>';
  } catch(e) {
    if (body) body.innerHTML = `<tr><td colspan="7" class="error">${escapeHtml(e.message)}</td></tr>`;
  }
}

async function loadAdminInvestorRecords() {
  try {
    const data = await api('/api/admin/investors');
    adminInvestorRecords = Array.isArray(data.investors) ? data.investors : [];
    return adminInvestorRecords;
  } catch (e) {
    console.error('Admin investor records:', e);
    return [];
  }
}

function renderAdminNetworkOverview() {
  const body = $('#adminNetworkBody');
  const root = $('#adminNetworkTree');
  if (!body || !isAdminUser(currentUser)) return;
  const users = Array.isArray(adminInvestorRecords) ? adminInvestorRecords : [];
  const children = new Map();
  users.forEach(u => {
    const parent = String(u.sponsorId || '');
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent).push(u);
  });
  children.forEach(list => list.sort((a,b)=>String(a.id).localeCompare(String(b.id), undefined, {numeric:true})));
  body.innerHTML = users.length ? users.map(u => `<tr data-admin-network-investor="${escapeHtml(u.id)}" style="cursor:pointer"><td><strong>${escapeHtml(u.id)}</strong></td><td>${escapeHtml(u.name || '')}</td><td>${escapeHtml(u.sponsorId || '—')}</td><td>${fmt(u.totalDeposit)}</td><td>${fmt(u.currentBalance)}</td><td>${fmt(u.roi)}</td><td>${fmt(u.levelIncome)}</td><td>${u.directDownlineCount || 0}</td><td>${escapeHtml(u.status || 'ACTIVE')}</td></tr>`).join('') : '<tr><td colspan="9">No investors found.</td></tr>';
  if (!root) return;
  const roots = users.filter(u => !u.sponsorId);
  const node = (u, level=0) => {
    const kids = (children.get(String(u.id)) || []).slice(0,5);
    const ownLedger = Array.isArray(u.levelIncomeLedger) ? u.levelIncomeLedger : [];
    const generated = ownLedger.reduce((s,e)=>s+Number(e.amount||0),0);
    return `<div class="network-node level-${Math.min(5,level+1)}" data-admin-network-node="${escapeHtml(u.id)}"><div class="network-node-main"><strong>${escapeHtml(u.id)}</strong><span>${escapeHtml(u.name||'')}</span><small>Deposit ${fmt(u.totalDeposit)} · Level Income ${fmt(generated)}</small></div>${kids.length ? `<div class="network-children">${kids.map(k=>node(k, level+1)).join('')}</div>` : ''}</div>`;
  };
  root.innerHTML = roots.length ? roots.map(u=>node(u,0)).join('') : '<div class="downline-empty">No network roots found.</div>';
}

async function openAdminInvestorDetails(id) {
  const row = document.querySelector(`#admin-detail-${CSS.escape(id)}`);
  if (!row) return;
  const wasHidden = row.hidden;
  document.querySelectorAll('.admin-detail-row').forEach(r => r.hidden = true);
  if (!wasHidden) return;
  row.hidden = false;
  const body = document.querySelector(`#admin-detail-body-${CSS.escape(id)}`);
  try {
    const data = await api(`/api/admin/investor-transactions?userId=${encodeURIComponent(id)}`);
    const inv = data.investor || {};
    const tx = data.transactions || [];
    const rows = tx.map(t => `<tr><td>${escapeHtml(formatDate(t.createdAt || t.date))}</td><td>${escapeHtml(t.type)}</td><td>${fmt(t.amount)}</td>
      <td>${fmt(t.type === 'ROI' ? t.amount : (t.roi || 0))}</td><td>${t.type === 'DEPOSIT' ? fmt(Number(t.amount || 0)*0.05) : '—'}</td>
      <td>${fmt(t.levelIncome || 0)}</td><td class="${statusClass(t.status)}">${escapeHtml(t.status || '')}</td><td>${escapeHtml(timeOnly(t.createdAt))}</td></tr>`).join('');
    body.innerHTML = rows || `<tr><td colspan="7">No transaction updates yet.</td></tr>`;
  } catch(e) { body.innerHTML = `<tr><td colspan="7" class="error">${escapeHtml(e.message)}</td></tr>`; }
}


function renderAdminSection(sectionName) {
  if (!isAdminUser(currentUser)) return;
  const tx = Array.isArray(currentDashboard?.transactions) ? currentDashboard.transactions : [];

  if (sectionName === 'network-overview') {
    renderAdminNetworkOverview();
    return;
  }

  if (sectionName === 'deposit' && $('#depositPageBody')) {
    const records = Array.isArray(adminInvestorRecords) && adminInvestorRecords.length ? adminInvestorRecords : [];
    const depositTx = tx.filter(t => String(t.type || '').toUpperCase() === 'DEPOSIT');
    const byInvestor = new Map();
    for (const t of depositTx) {
      const id = String(t.userId || '');
      if (!id) continue;
      if (!byInvestor.has(id)) byInvestor.set(id, []);
      byInvestor.get(id).push(t);
    }
    const rows = records.map(inv => {
      const list = byInvestor.get(String(inv.id)) || [];
      const verified = list.filter(t => getTransactionStatus(t) === 'VERIFIED').reduce((sum,t)=>sum+Number(t.amount||0),0);
      const pending = list.filter(t => getTransactionStatus(t) === 'PENDING').reduce((sum,t)=>sum+Number(t.amount||0),0);
      const last = list.slice().sort((a,b)=>String(b.createdAt||b.date||'').localeCompare(String(a.createdAt||a.date||'')))[0];
      return `<tr class="admin-investor-row" data-admin-deposit-investor="${escapeHtml(inv.id)}" style="cursor:pointer">
        <td><strong>${escapeHtml(inv.id)}</strong></td><td>${escapeHtml(inv.name || '')}</td><td><strong>${fmt(verified)}</strong></td><td>${pending ? fmt(pending) : '—'}</td><td>${last ? escapeHtml(formatDate(last.createdAt || last.date)) : '—'}</td><td>View deposits →</td>
      </tr>
      <tr id="admin-deposit-detail-${escapeHtml(inv.id)}" class="admin-detail-row" hidden><td colspan="6"><div class="admin-detail-summary"><strong>${escapeHtml(inv.id)} – ${escapeHtml(inv.name || '')}</strong><span>Total Verified: ${fmt(verified)}</span></div><div class="table-wrap"><table class="admin-detail-table"><thead><tr><th>Deposit Amount</th><th>Date</th><th>Time</th><th>Status</th><th>UTR</th><th>Proof</th></tr></thead><tbody id="admin-deposit-detail-body-${escapeHtml(inv.id)}"><tr><td colspan="6">Loading...</td></tr></tbody></table></div></td></tr>`;
    }).join('');
    $('#depositPageBody').innerHTML = rows || '<tr><td colspan="6">No investors found.</td></tr>';
    const head = $('#depositPageBody').closest('table')?.querySelector('thead tr');
    if (head) head.innerHTML = '<th>Investor ID</th><th>Name</th><th>Total Verified Deposit</th><th>Pending Deposit</th><th>Last Deposit</th><th>Details</th>';
    $('#openDepositPageBtn')?.remove();
    return;
  }

  if (sectionName === 'withdraw' && $('#withdrawPageBody')) {
    const rows = tx.filter(t => ['WITHDRAWAL','CASHBACK_WITHDRAWAL','LEVEL_INCOME_WITHDRAWAL'].includes(String(t.type||'').toUpperCase())).map(t => {
      const type = String(t.type||'').toUpperCase();
      const commission = type === 'WITHDRAWAL' ? Number(t.companyCommission || 0) : 0;
      const net = type === 'WITHDRAWAL' ? Number(t.netAmount ?? (Number(t.amount||0)-commission)) : Number(t.amount||0);
      return `<tr><td><strong>${escapeHtml(t.userId)}</strong></td><td>${escapeHtml(type.replaceAll('_',' '))}</td><td>${fmt(t.amount)}</td><td>${fmt(commission)}</td><td><strong>${fmt(net)}</strong></td><td>${escapeHtml(formatDate(t.createdAt||t.date))}</td><td class="${statusClass(t.status)}">${escapeHtml(t.status||'')}</td><td>${t.adminProof?.data ? `<button class="mini" onclick="viewProof('${escapeHtml(t.adminProof.data)}','')">View</button>` : '—'}</td></tr>`;
    }).join('');
    const head = $('#withdrawPageBody').closest('table')?.querySelector('thead tr');
    if (head) head.innerHTML = '<th>Investor ID</th><th>Type</th><th>Gross Amount</th><th>Company Commission</th><th>Net Amount</th><th>Date</th><th>Status</th><th>Proof</th>';
    $('#withdrawPageBody').innerHTML = rows || '<tr><td colspan="8">No withdrawal requests.</td></tr>';
    $('#openWithdrawPageBtn')?.remove();
    return;
  }

  if (sectionName === 'cashback' && $('#cashbackBody')) {
    $('#openCashbackWithdrawBtn')?.setAttribute('hidden','');
    const cashbackSection = $('#section-cashback');
    const cashbackHeader = cashbackSection?.querySelector('#cashbackBody')?.closest('table')?.querySelector('thead tr');
    if (cashbackHeader) cashbackHeader.innerHTML = '<th>Investor ID</th><th>Verified Deposits</th><th>Cash Back Earned</th><th>Available Cash Back</th>';
    const users = adminInvestorRecords || [];
    $('#cashbackAvailable').textContent = fmt(users.reduce((s,u)=>s+Number(u.cashBack||0),0));
    $('#cashbackBody').innerHTML = users.map(u => `<tr><td><strong>${escapeHtml(u.id)}</strong></td><td>${fmt(u.totalDeposit)}</td><td>${fmt(u.cashBackEarned || 0)}</td><td><strong>${fmt(u.cashBack)}</strong></td></tr>`).join('') || '<tr><td colspan="4">No investors.</td></tr>';
    const cbw = tx.filter(t => String(t.type || '').toUpperCase() === 'CASHBACK_WITHDRAWAL');
    if ($('#cashbackWithdrawBody')) $('#cashbackWithdrawBody').innerHTML = cbw.length ? cbw.map(t => `<tr><td>${fmt(t.amount)}</td><td>${escapeHtml(formatDate(t.createdAt || t.date))}</td><td>${escapeHtml(timeOnly(t.createdAt))}</td><td class="${statusClass(t.status)}">${escapeHtml(t.status || '')}</td><td>${t.adminProof?.data ? `<button class="mini" onclick="viewProof('${escapeHtml(t.adminProof.data)}','')">View</button>` : '—'}</td></tr>`).join('') : '<tr><td colspan="5">No requests yet.</td></tr>';
    return;
  }

  if (sectionName === 'level-incomes' && $('#levelIncomeBody')) {
    $('#openLevelIncomeWithdrawBtn')?.setAttribute('hidden','');
    const levelSection = $('#section-level-incomes');
    const users = adminInvestorRecords || [];
    $('#adminLevelLegacyDownlineSection')?.setAttribute('hidden','');
    if (levelSection) {
      const h3s = levelSection.querySelectorAll('h3');
      if (h3s[0]) h3s[0].textContent = 'Investor Level Income Summary';
      if (h3s[1]) h3s[1].textContent = 'Level Income Audit Details';
      if (h3s[2]) h3s[2].textContent = 'Level Income Withdrawals';
      const p = levelSection.querySelector('.section-subtitle');
      if (p) p.textContent = 'Admin view: monitor each investor’s Level Income, source member, level, ROI, rate and amount.';
    }
    const gross = users.reduce((s,u)=>s+Number(u.levelIncomeTotal||0),0);
    const available = users.reduce((s,u)=>s+Number(u.levelIncome||0),0);
    const withdrawn = Math.max(0, gross - available);
    $('#levelIncomeAvailable').textContent = fmt(available);
    $('#levelIncomeNext').textContent = fmt(gross);
    const levelNextLabel = levelSection?.querySelector('#levelIncomeNext')?.closest('.stat')?.querySelector('.label');
    if (levelNextLabel) levelNextLabel.textContent = 'Total Level Income Earned';
    const levelAvailableLabel = levelSection?.querySelector('#levelIncomeAvailable')?.closest('.stat')?.querySelector('.label');
    if (levelAvailableLabel) levelAvailableLabel.textContent = 'Available Level Income';
    if ($('#levelIncomeWithdrawn')) $('#levelIncomeWithdrawn').textContent = fmt(withdrawn);
    const levelHeader = $('#levelIncomeBody')?.closest('table')?.querySelector('thead tr');
    if (levelHeader) levelHeader.innerHTML = '<th>Investor ID</th><th>Name</th><th>Updated Deposit</th><th>Total Level Income</th><th>Available Balance</th><th>Details</th>';
    $('#levelIncomeBody').innerHTML = users.map(u => `<tr data-admin-level-investor="${escapeHtml(u.id)}" style="cursor:pointer"><td><strong>${escapeHtml(u.id)}</strong></td><td>${escapeHtml(u.name||'')}</td><td>${fmt(u.totalDeposit)}</td><td>${fmt(u.levelIncomeTotal||0)}</td><td><strong>${fmt(u.levelIncome||0)}</strong></td><td>View audit →</td></tr><tr id="admin-level-detail-${escapeHtml(u.id)}" class="admin-detail-row" hidden><td colspan="6"><div class="admin-detail-summary"><strong>${escapeHtml(u.id)} – ${escapeHtml(u.name||'')}</strong><span>Gross: ${fmt(u.levelIncomeTotal||0)} · Available: ${fmt(u.levelIncome||0)}</span></div><div class="table-wrap"><table class="admin-detail-table"><thead><tr><th>Date</th><th>Level</th><th>Source Investor</th><th>Source ROI</th><th>Rate</th><th>Level Income</th></tr></thead><tbody>${(Array.isArray(u.levelIncomeLedger)?u.levelIncomeLedger:[]).slice().sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))).map(e=>`<tr><td>${escapeHtml(formatLevelIncomeDate(e.date))}</td><td>${escapeHtml(String(e.level||''))}</td><td><strong>${escapeHtml(e.sourceUserId||'')}</strong><br><small>${escapeHtml(e.sourceName||'')}</small></td><td>${fmt(e.sourceROI||0)}</td><td>${fmt(e.rate||0)}%</td><td><strong>${fmt(e.amount||0)}</strong></td></tr>`).join('') || '<tr><td colspan="6">No Level Income entries.</td></tr>'}</tbody></table></div></td></tr>`).join('') || '<tr><td colspan="6">No investors found.</td></tr>';
    const ledgerRows = [];
    for (const u of users) for (const e of (Array.isArray(u.levelIncomeLedger) ? u.levelIncomeLedger : [])) ledgerRows.push({u,e});
    ledgerRows.sort((a,b)=>String(a.e.date||'').localeCompare(String(b.e.date||'')) || String(a.u.id||'').localeCompare(String(b.u.id||''),undefined,{numeric:true}) || Number(a.e.level||0)-Number(b.e.level||0));
    if ($('#levelDownlineIncomeBody')) $('#levelDownlineIncomeBody').innerHTML = ledgerRows.length ? ledgerRows.map(({u,e})=>`<tr><td>${escapeHtml(formatLevelIncomeDate(e.date))}</td><td>${escapeHtml(String(e.level||'—'))}</td><td><strong>${escapeHtml(e.sourceUserId||'—')}</strong></td><td>${escapeHtml(e.sourceName||'—')}</td><td>${fmt(e.sourceDeposit||0)}</td><td>${fmt(e.sourceROI||0)}</td><td>${fmt(e.rate||0)}%</td><td><strong>${fmt(e.amount||0)}</strong></td></tr>`).join('') : '<tr><td colspan="8">No Level Income details.</td></tr>';
    if ($('#levelDirectDownlineCount')) $('#levelDirectDownlineCount').textContent = users.reduce((s,u)=>s+Number(u.directDownlineCount||0),0);
    if ($('#levelTotalDownlineCount')) $('#levelTotalDownlineCount').textContent = users.reduce((s,u)=>s+Number(u.directDownlineCount||0),0);
    if ($('#levelDownlineBody')) $('#levelDownlineBody').innerHTML = users.map(u=>`<tr><td>—</td><td><strong>${escapeHtml(u.id)}</strong></td><td>${escapeHtml(u.name||'')}</td><td>${fmt(u.totalDeposit)}</td><td><strong>${fmt(u.levelIncome||0)}</strong></td></tr>`).join('') || '<tr><td colspan="5">No investors.</td></tr>';
    return;
  }
}

// ============================================================
// PORTAL NAVIGATION
// ============================================================

function showSection(
  sectionName
) {

  if (!sectionName) return;

  // Company Profit / Loss → Dashboard only
const companyProfitLoss = document.querySelectorAll(
    '#section-company-profit-loss, #adminCompanyProfitLossView, [data-section="company-profit-loss"]'
);

companyProfitLoss.forEach(el => {
    el.hidden = sectionName !== "dashboard";
    el.style.display = sectionName === "dashboard" ? "" : "none";
});


  const sections =
    $$(".page-section");


  sections.forEach(
    section => {

      section.hidden =
        true;

      section.classList.remove(
        "active-section"
      );

    }
  );


  const target =
    document.querySelector(
      `#section-${CSS.escape(sectionName)}`
    );


  if (!target) {

    console.warn(
      "Section not found:",
      sectionName
    );

    return;

  }


  target.hidden =
    false;


  target.classList.add(
    "active-section"
  );


  $$(".nav-item[data-section]")
    .forEach(
      button => {

        button.classList.toggle(
          "active",
          button.dataset.section ===
            sectionName
        );

      }
    );


  const navButton =
    document.querySelector(
      `.nav-item[data-section="${CSS.escape(sectionName)}"]`
    );


  const label =
    navButton?.querySelector(
      "span:last-child"
    );


  if (
    label &&
    $("#topSectionLabel")
  ) {

    $("#topSectionLabel").textContent =
      label.textContent.trim();

  }


  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });


  if (
    sectionName ===
    "investment"
  ) {

    updateInvestmentPage();

  }


  if (
    sectionName ===
    "bank"
  ) {

    loadBankAccounts();

  }


  if (
    sectionName ===
    "profile"
  ) {

    loadProfile(currentUser);

  }



  const companyPerformanceSection =
  $("#section-company-performance");

  const companyProfitLossSection =
    $("#section-company-profit-loss");

if (companyProfitLossSection) {
    const showCompanyProfitLoss = sectionName === "dashboard";

    companyProfitLossSection.hidden = !showCompanyProfitLoss;
    companyProfitLossSection.style.display =
        showCompanyProfitLoss ? "block" : "none";
}

  if (companyPerformanceSection) {
    const showCompanyPerformance =
      sectionName === "dashboard";

    companyPerformanceSection.hidden = !showCompanyPerformance;
    companyPerformanceSection.style.display =
      showCompanyPerformance ? "block" : "none";
  }
  
  if (
    sectionName ===
    "company-performance"
  ) {

    const adminUploadView = $("#adminCompanyProfitLossView");

    if (adminUploadView) {
    if (isAdminUser(currentUser)) {
        adminUploadView.hidden = false;
        adminUploadView.style.display = "block";
    } else {
        adminUploadView.hidden = true;
        adminUploadView.style.display = "none";
    }
}
    

    loadCompanyProfitLossImages();

  }

  const profitLossSectionFinal =
    $("#section-company-profit-loss");

if (profitLossSectionFinal) {
    profitLossSectionFinal.hidden =
        sectionName !== "dashboard";

    profitLossSectionFinal.style.display =
        sectionName === "dashboard" ? "block" : "none";
}

  if (isAdminUser(currentUser)) {
    renderAdminSection(sectionName);
    if (['deposit', 'cashback', 'level-incomes', 'network-overview'].includes(sectionName)) {
      loadAdminInvestorRecords().then(() => {
        renderAdminSection(sectionName);
        if (sectionName === 'network-overview') renderAdminNetworkOverview();
      }).catch(() => {});
    }
    if (sectionName === 'investment') loadAdminInvestorsPhase3();
    if (sectionName === 'investor-access') loadAdminInvestorAccess();
  }

}


window.showSection =
  showSection;


// ============================================================
// INVESTMENT PAGE
// ============================================================

async function updateInvestmentPage() {
  try {
    const data = currentDashboard || await api("/api/dashboard");
    currentDashboard = data;
    const user = data?.user || {};
    const transactions = Array.isArray(data?.transactions) ? data.transactions : [];

    if (isAdminUser(user)) {
      $("#investorInvestmentView")?.setAttribute("hidden", "");
      $("#adminInvestmentView")?.removeAttribute("hidden");
      await loadAdminInvestors();
      await loadProfileRequests();
      return;
    }

    $("#adminInvestmentView")?.setAttribute("hidden", "");
    $("#investorInvestmentView")?.removeAttribute("hidden");

    const deposits = transactions.filter(t => String(t.type).toUpperCase() === "DEPOSIT");
    const withdrawals = transactions.filter(t => String(t.type).toUpperCase() === "WITHDRAWAL");
    const totalDeposit = deposits.filter(t => getTransactionStatus(t) === "VERIFIED").reduce((s,t)=>s+Number(t.amount||0),0);
    const totalWithdraw = withdrawals.filter(t => getTransactionStatus(t) === "VERIFIED").reduce((s,t)=>s+Number(t.amount||0),0);

    if ($("#investmentTotalDeposit")) $("#investmentTotalDeposit").textContent = fmt(totalDeposit);
    if ($("#investmentTotalWithdraw")) $("#investmentTotalWithdraw").textContent = fmt(totalWithdraw);
    if ($("#investmentCurrentBalance")) $("#investmentCurrentBalance").textContent = fmt(user.currentBalance || 0);

    const rows = list => list.length ? list.map(t => `
      <tr>
        <td>${escapeHtml(formatDate(t.createdAt || t.date ))}</td>
        <td>${fmt(t.amount)}</td>
        <td><span class="badge ${escapeHtml(getTransactionStatus(t).toLowerCase())}">${escapeHtml(getTransactionStatus(t))}</span></td>
      </tr>
    `).join("") : `<tr><td colspan="3">No records.</td></tr>`;

    if ($("#investorDepositBody")) $("#investorDepositBody").innerHTML = rows(deposits);
    if ($("#investorWithdrawBody")) $("#investorWithdrawBody").innerHTML = rows(withdrawals);
  } catch (error) {
    console.error("Investment page error:", error);
    handleAuthError(error);
  }
}

// ============================================================
// EXCEL EXPORT - EXCEL COMPATIBLE XML
// ============================================================

function xmlEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function downloadExcelXml(filename, sheetName, columns, rows) {
    try {
        if (typeof XLSX === "undefined") {
            alert("Excel export library is not loaded.");
            return;
        }

        const safeFilename = String(filename || "SPARTNER_Statement")
            .replace(/\.xml\.xls$/i, "")
            .replace(/\.xml$/i, "")
            .replace(/\.xls$/i, "")
            .replace(/\.xlsx$/i, "") + ".xlsx";

        const data = [columns, ...rows];

        const worksheet = XLSX.utils.aoa_to_sheet(data);

        const workbook = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            sheetName || "Statement"
        );

        XLSX.writeFile(workbook, safeFilename);
    } catch (error) {
        console.error("Excel export error:", error);
        alert("Unable to download Excel statement.");
    }
}

async function downloadInvestorExcel(userId) {
  try {
    const data = await api(`/api/admin/investor-transactions?userId=${encodeURIComponent(userId)}`);
    const transactions = Array.isArray(data.transactions) ? data.transactions : [];
    const rows = transactions.map(t => [
      t.id,
      t.type,
      Number(t.amount || 0).toLocaleString("en-IN"),
      t.utrNumber || "",
      getTransactionStatus(t),
      formatDate(t.createdAt || t.date  )
    ]);
    downloadExcelXml(
      `SPARTNER_${userId}_Transactions.xls`,
      "Transactions",
      ["Transaction ID","Type","Amount","UTR","Status","Date"],
      rows
    );
  } catch (error) {
    if (!handleAuthError(error)) alert(error.message || "Unable to download investor statement.");
  }
}

async function downloadWithdrawalStatement() {
  try {
    const data = await api('/api/withdrawal-statements');
    const withdrawals = Array.isArray(data.withdrawals) ? data.withdrawals : [];
    const isAdmin = isAdminUser(currentDashboard?.user || {});
    const rows = withdrawals.map(t => [
      t.id,
      isAdmin ? t.investorId : '',
      isAdmin ? t.investorName : '',
      Number(t.amount || 0).toLocaleString('en-IN'),
      Number(t.companyCommission || 0).toLocaleString('en-IN'),
      Number(t.netAmount ?? t.amount ?? 0).toLocaleString('en-IN'),
      t.status || '',
      formatDate(t.createdAt || t.date),
      t.bankName || '',
      t.accountHolderName || '',
      t.accountNumber || '',
      t.ifsc || '',
      formatDate(t.verifiedAt || t.rejectedAt || '')
    ]);
    const columns = isAdmin
      ? ['Withdrawal ID','Investor ID','Investor Name','Gross Amount','Commission','Net Amount','Status','Date','Bank','Account Holder','Account Number','IFSC','Processed At']
      : ['Withdrawal ID','Gross Amount','Commission','Net Amount','Status','Date','Bank','Account Holder','Account Number','IFSC','Processed At'];
    const finalRows = isAdmin ? rows : rows.map(r => [r[0],r[3],r[4],r[5],r[6],r[7],r[8],r[9],r[10],r[11],r[12]]);
    downloadExcelXml(isAdmin ? 'SPARTNER_All_Withdrawal_Statement.xml' : 'SPARTNER_My_Withdrawal_Statement.xml', 'Withdrawals', columns, finalRows);
  } catch (error) {
    if (!handleAuthError(error)) alert(error.message || 'Unable to download withdrawal statement.');
  }
}



async function loadAdminInvestorAccess() {
  const body = $('#adminInvestorAccessBody');
  if (!body || !isAdminUser(currentUser)) return;
  try {
    const data = await api('/api/admin/investor-access');
    const investors = Array.isArray(data.investors) ? data.investors : [];
    window.adminAccessInvestors = investors;
    const renderRows = (list) => {
      body.innerHTML = list.length ? list.map(inv => `
        <tr><td><strong>${escapeHtml(inv.id)}</strong></td><td>${escapeHtml(inv.name)}</td><td>${escapeHtml(inv.email)}</td><td><span class="badge ${escapeHtml(String(inv.status||'ACTIVE').toLowerCase())}">${escapeHtml(inv.status)}</span></td><td>${fmt(inv.totalInvestment)}</td><td>${fmt(inv.currentBalance)}</td><td><button type="button" class="mini" data-login-as-investor="${escapeHtml(inv.id)}">Open Portal</button></td></tr>
      `).join('') : '<tr><td colspan="7">No matching investors found.</td></tr>';
    };
    renderRows(investors);
    const search = $('#adminInvestorSearch');
    if (search && !search.dataset.bound) {
      search.dataset.bound = '1';
      search.addEventListener('input', () => {
        const q = search.value.trim().toLowerCase();
        renderRows(investors.filter(inv => [inv.id, inv.name, inv.email, inv.status].some(v => String(v||'').toLowerCase().includes(q))));
      });
    }
  } catch (e) { body.innerHTML = `<tr><td colspan="7" class="error">${escapeHtml(e.message)}</td></tr>`; }
}

async function loginAsInvestor(investorId) {
  try {
    const data = await api('/api/admin/login-as-investor', { method:'POST', body: JSON.stringify({ investorId }) });
    currentDashboard = null;
    currentUser = data.user || null;
    await load(false);
    showSection('dashboard');
  } catch (e) { alert(e.message || 'Unable to open investor portal'); }
}

async function returnToAdminPortal() {
  try {
    const data = await api('/api/admin/return', { method:'POST' });
    currentDashboard = null;
    currentUser = data.user || null;
    await load(false);
    showSection('dashboard');
  } catch (e) { alert(e.message || 'Unable to return to Admin Portal'); }
}

async function loadAdminInvestors() {
  return loadAdminInvestorsPhase3();
}

async function loadProfileRequests() {
  const tableBody = $("#profileRequestBody");
  if (!tableBody) return;

  try {
    const data = await api("/api/admin/profile-requests");
    const requests = (data.requests || []).filter(r => r.status === "PENDING");

    tableBody.innerHTML = requests.length
      ? requests.map(request => {
          const changes = Object.entries(request.changes || {})
            .map(([field, values]) =>
              `${escapeHtml(field)}: ${escapeHtml(values.oldValue || "—")} → ${escapeHtml(values.newValue || "—")}`
            )
            .join("<br>");

          return `
            <tr>
              <td>${escapeHtml(request.investor || request.userId)}</td>
              <td>${changes}</td>
              <td>${escapeHtml(formatDate(request.createdAt))}</td>
              <td>
                <button type="button" class="mini" data-profile-request="APPROVED" data-request-id="${escapeHtml(request.id)}">Approve</button>
                <button type="button" class="mini danger-mini" data-profile-request="REJECTED" data-request-id="${escapeHtml(request.id)}">Reject</button>
              </td>
            </tr>
          `;
        }).join("")
      : `<tr><td colspan="4">No pending requests.</td></tr>`;
  } catch (error) {
    if (!handleAuthError(error)) {
      tableBody.innerHTML = `<tr><td colspan="4" class="error">${escapeHtml(error.message)}</td></tr>`;
    }
  }
}

async function loadCompanyProfitLossImages() {
  const gallery = $('#companyProfitLossGallery');
  if (!gallery) return;
  try {
    const data = await api('/api/company-profit-loss-images');
    const images = Array.isArray(data.images) ? data.images : [];
    gallery.innerHTML = images.length
      ? images.map(image => `
          <div class="company-proof-card">
            <div class="company-proof-meta">
              <strong>${escapeHtml(image.date || '')}</strong>
              ${image.note ? `<span>${escapeHtml(image.note)}</span>` : ''}
            </div>
            <a href="${escapeHtml(image.imageUrl)}" target="_blank" rel="noopener">
              <img src="${escapeHtml(image.imageUrl)}" alt="Company profit/loss screenshot">
            </a>
          </div>
        `).join('')
      : '<div class="empty-state">No company profit/loss screenshots uploaded yet.</div>';
  } catch (error) {
    if (!handleAuthError(error)) gallery.innerHTML = `<div class="error">${escapeHtml(error.message)}</div>`;
  }
}

async function uploadCompanyProfitLossImage(event) {
  event.preventDefault();
  const message = $('#companyProfitLossMsg');
  const file = $('#companyProfitLossImage')?.files?.[0];
  const date = $('#companyProfitLossDate')?.value || '';
  const note = $('#companyProfitLossNote')?.value.trim() || '';
  if (!file) { if (message) message.textContent = 'Please select a screenshot/image.'; return; }
  const form = new FormData();
  form.append('date', date);
  form.append('note', note);
  form.append('companyProfitLossImage', file);
  try {
    const result = await api('/api/company-profit-loss-images', { method: 'POST', body: form });
    if (message) { message.textContent = result.message || 'Uploaded successfully'; message.className = 'success'; }
    $('#companyProfitLossForm')?.reset();
    if ($('#companyProfitLossDate')) $('#companyProfitLossDate').value = new Date().toISOString().slice(0,10);
    await loadCompanyProfitLossImages();
  } catch (error) {
    if (message) { message.textContent = error.message || 'Unable to upload screenshot'; message.className = 'error'; }
  }
}

function suggestNextInvestorId() {
  const existing = Array.isArray(adminInvestorRecords) ? adminInvestorRecords : [];
  const nums = existing
    .map(x => String(x?.id || '').toUpperCase().match(/^INV(\d+)$/))
    .filter(Boolean)
    .map(m => Number(m[1]))
    .filter(Number.isFinite);
  const next = (nums.length ? Math.max(...nums) + 1 : 1);
  const input = $("#newInvestorId");
  if (input) input.value = `INV${String(next).padStart(3, '0')}`;
}

async function handleCreateInvestor(event) {
  event.preventDefault();
  const message = $("#createInvestorMsg");

  try {
    const result = await api("/api/admin/investors", {
      method: "POST",
      body: JSON.stringify({
        id: $("#newInvestorId").value.trim(),
        name: $("#newInvestorName").value.trim(),
        email: $("#newInvestorEmail").value.trim(),
        password: $("#newInvestorPassword").value,
        sponsorId: $("#newInvestorSponsorId")?.value.trim() || ""
      })
    });

    if (message) {
      message.textContent = result.message || "Investor created";
      message.className = "success";
    }

    $("#createInvestorForm").reset();
    await loadAdminInvestors();
  } catch (error) {
    if (message) {
      message.textContent = error.message || "Unable to create investor";
      message.className = "error";
    }
  }
}

async function handleProfileRequestAction(button) {
  try {
    await api("/api/admin/profile-request-status", {
      method: "POST",
      body: JSON.stringify({
        requestId: button.dataset.requestId,
        status: button.dataset.profileRequest
      })
    });

    await loadProfileRequests();
    await load(false);
  } catch (error) {
    alert(error.message || "Unable to update request");
  }
}

// ============================================================
// BANK ACCOUNT NUMBER MASK
// ============================================================

function maskAccountNumber(
  accountNumber
) {

  const value =
    String(
      accountNumber || ""
    );


  if (!value) {

    return "—";

  }


  if (
    value.length <= 4
  ) {

    return value;

  }


  return (
    "•".repeat(
      Math.max(
        4,
        value.length - 4
      )
    )
    +
    value.slice(-4)
  );

}

async function deleteBankAccount(accountId) {
  if (!accountId) {
    alert("Bank account ID missing.");
    return;
  }

  if (!confirm("Are you sure you want to delete this bank account?")) {
    return;
  }

  try {
    await api(
      `/api/bank-accounts/${encodeURIComponent(accountId)}`,
      {
        method: "DELETE"
      }
    );

    alert("Bank account deleted successfully.");

    await loadBankAccounts();

  } catch (error) {
    console.error("Delete bank account error:", error);

    alert(
      error?.message ||
      "Unable to delete bank account."
    );
  }
}

// ============================================================
// BANK ACCOUNTS PAGE
// ============================================================

async function loadBankAccounts() {

  const grid =
    $("#bankAccountsGrid");


  if (!grid) {

    return;

  }


  grid.innerHTML = `

    <div class="panel">

      <p class="muted">
        Loading bank accounts...
      </p>

    </div>

  `;


  try {

    const data =
      await api(
        "/api/bank-accounts"
      );


    /*
      Support both possible server response shapes:

      {
        accounts: []
      }

      OR

      {
        bankAccounts: []
      }
    */

    const accounts =
      Array.isArray(
        data?.accounts
      )
        ? data.accounts
        : Array.isArray(
            data?.bankAccounts
          )
          ? data.bankAccounts
          : [];


    // ========================================================
    // PAGE HEADER
    // ========================================================

    let html = `

      <div
        style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:16px;
          flex-wrap:wrap;
          margin-bottom:20px;
        "
      >

        <div>

          <h2 style="margin:0;">
            Bank Accounts
          </h2>

          <p
            class="muted"
            style="margin:6px 0 0;"
          >
            
          </p>

        </div>

        ${
          accounts.length < 4
            ? `
              <button
                type="button"
                class="btn primary"
                id="addBankAccountBtn"
              >
                + Add Bank Account
              </button>
            `
            : `
              <span class="muted">
                Maximum 4 accounts added
              </span>
            `
        }

      </div>

      <div
        class="panel"
        style="
          margin-bottom:20px;
          background:rgba(255,243,230,.55);
        "
      >

        <div
          style="
            display:flex;
            align-items:center;
            gap:12px;
          "
        >

          <div
            style="
              font-size:28px;
              line-height:1;
            "
          >
            🏦
          </div>

          <div>

            <strong>
              
            </strong>

            <div class="muted">
              
            </div>

          </div>

        </div>

      </div>

    `;


    // ========================================================
    // NO ACCOUNTS
    // ========================================================

    if (accounts.length === 0) {

      html += `

        <div
          class="panel"
          style="
            text-align:center;
            padding:40px 20px;
          "
        >

          <div
            style="
              font-size:42px;
              margin-bottom:10px;
            "
          >
            🏦
          </div>

          <h3>
            No Bank Accounts Added
          </h3>

          <p class="muted">
            Add your bank account for withdrawals.
          </p>

          <button
            type="button"
            class="btn primary"
            id="addBankAccountEmptyBtn"
          >
            + Add Bank Account
          </button>

        </div>

      `;

    }


    // ========================================================
    // ACCOUNT LIST
    // ========================================================

    else {

      html += `

        <div
          style="
            display:grid;
            grid-template-columns:
              repeat(auto-fit,minmax(280px,1fr));
            gap:18px;
          "
        >

      `;


      accounts.forEach(
        (account, index) => {

          const bankName =
            account?.bankName ||
            account?.bank ||
            "Bank Account";


          const holder =
            account?.accountHolderName ||
            account?.accountHolder ||
            account?.holderName ||
            "—";


          const accountNumber =
            account?.accountNumber ||
            account?.accountNumberMasked ||
            account?.maskedAccountNumber ||
            "";


          const ifsc =
            account?.ifsc ||
            account?.IFSC ||
            "—";


          /*
            If server already returns a masked account number,
            do not mask it again.
          */

          const displayAccountNumber =
            account?.accountNumberMasked ||
            account?.maskedAccountNumber
              ? String(account.accountNumberMasked || account.maskedAccountNumber)
              : maskAccountNumber(
                  accountNumber
                );


          html += `

            <div class="panel">

              <div
                style="
                  display:flex;
                  justify-content:space-between;
                  align-items:flex-start;
                  gap:10px;
                "
              >

                <div>

                  <h3 style="margin:0 0 5px;">
                    ${escapeHtml(bankName)}
                  </h3>

                  <span class="muted">
                    Account ${index + 1}
                  </span>

                </div>

                <span>
                  🏦
                </span>

              </div>


              <hr
                style="
                  margin:18px 0;
                  opacity:.2;
                "
              >


              <p>

                <strong>
                  Account Holder
                </strong>

                <br>

                ${escapeHtml(holder)}

              </p>


              <p>

                <strong>
                  Account Number
                </strong>

                <br>

                ${escapeHtml(
                  displayAccountNumber
                )}

              </p>


              <p>
                <strong>IFSC</strong><br>
                ${escapeHtml(ifsc)}
              </p>

              <p>
                <strong>Status</strong><br>
                <span class="${String(account.status || 'PENDING').toUpperCase() === 'VERIFIED' ? 'status-approved' : 'status-pending'}">${escapeHtml(account.status || 'PENDING')}</span>
              </p>

              ${isAdminUser(currentUser) && String(account.status || 'PENDING').toUpperCase() === 'PENDING' ? `
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0;">
                  <button type="button" class="mini" data-bank-approve="${escapeHtml(account.id)}">Approve</button>
                  <button type="button" class="mini danger-mini" data-bank-reject="${escapeHtml(account.id)}">Reject</button>
                </div>` : ''}

              <div
              style="
                display:flex;
                gap:10px;
                margin-top:18px;
                flex-wrap:wrap;
              "
            >

              <button
                type="button"
                class="btn"
                data-bank-edit="${escapeHtml(account.id)}"
              >
                ✏️ Edit
              </button>

              <button
                type="button"
                class="btn"
                data-bank-delete="${escapeHtml(account.id)}"
                style="
                  background:#dc2626;
                  color:#fff;
                "
              >
                🗑️ Delete
              </button>

            </div>

            </div>

          `;

        }
      );


      html += `

        </div>

      `;

    }


    grid.innerHTML =
      html;

    // ========================================================
    // EDIT BANK ACCOUNT
    // ========================================================

    grid
      .querySelectorAll("[data-bank-edit]")
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            const accountId =
              button.dataset.bankEdit;

            const account =
              accounts.find(
                item =>
                  String(item.id) ===
                  String(accountId)
              );

            if (!account) {

              alert(
                "Bank account not found."
              );

              return;

            }

            openEditBankAccountModal(
              account
            );

          }
        );

      });


    // ========================================================
    // DELETE BANK ACCOUNT
    // ========================================================

    grid
      .querySelectorAll("[data-bank-delete]")
      .forEach(button => {

        button.addEventListener(
          "click",
          async () => {

            const accountId =
              button.dataset.bankDelete;

            await deleteBankAccount(
              accountId
            );

          }
        );

      });  


    grid.querySelectorAll("[data-bank-approve],[data-bank-reject]").forEach(button => {
      button.addEventListener("click", async () => {
        const status = button.dataset.bankApprove ? "VERIFIED" : "REJECTED";
        try {
          await api("/api/admin/bank-account-status", {
            method: "POST",
            body: JSON.stringify({ accountId: button.dataset.bankApprove || button.dataset.bankReject, status })
          });
          await loadBankAccounts();
        } catch (e) { alert(e.message || "Unable to update bank account status"); }
      });
    });

    // ========================================================
    // ADD BUTTON
    // ========================================================

    const addBtn =
      $("#addBankAccountBtn");


    if (addBtn) {

      addBtn.addEventListener(
        "click",
        openBankAccountModal
      );

    }


    const addEmptyBtn =
      $("#addBankAccountEmptyBtn");


    if (addEmptyBtn) {

      addEmptyBtn.addEventListener(
        "click",
        openBankAccountModal
      );

    }

  } catch (error) {

    console.error(
      "Bank accounts error:",
      error
    );


    if (
      handleAuthError(error)
    ) {

      return;

    }


    grid.innerHTML = `

      <div class="panel">

        <h3>
          Bank Accounts
        </h3>

        <p class="error">
          ${escapeHtml(
            error.message ||
            "Unable to load bank accounts."
          )}
        </p>

        <button
          type="button"
          class="btn primary"
          id="retryBankAccountsBtn"
        >
          Retry
        </button>

      </div>

    `;


    const retry =
      $("#retryBankAccountsBtn");


    if (retry) {

      retry.addEventListener(
        "click",
        loadBankAccounts
      );

    }

  }

}


// ============================================================
// BANK ACCOUNT MODAL
// ============================================================

function createBankAccountModal() {

  if ($("#bankAccountModal")) {

    return;

  }


  const modal =
    document.createElement("div");


  modal.id =
    "bankAccountModal";


  modal.hidden =
    true;


  modal.style.cssText = `
    position:fixed;
    inset:0;
    z-index:9999;
    background:rgba(0,0,0,.55);
    display:flex;
    align-items:center;
    justify-content:center;
    padding:20px;
  `;


  modal.innerHTML = `

    <div
      style="
        width:min(520px,100%);
        max-height:90vh;
        overflow:auto;
        background:#fff;
        border-radius:18px;
        padding:25px;
        box-shadow:0 20px 60px rgba(0,0,0,.25);
      "
    >

      <div
        style="
          display:flex;
          justify-content:space-between;
          align-items:center;
          gap:15px;
          margin-bottom:20px;
        "
      >

        <div>

          <h2 id="bankAccountModalTitle" style="margin:0;">
            Add Bank Account
          </h2>

          <p
            class="muted"
            style="margin:5px 0 0;"
          >
            Enter your bank details carefully.
          </p>

        </div>


        <button
          type="button"
          id="closeBankAccountModal"
          aria-label="Close"
          style="
            border:0;
            background:transparent;
            font-size:28px;
            cursor:pointer;
          "
        >
          ×
        </button>

      </div>


      <form id="bankAccountForm">

        <div style="margin-bottom:16px;">
          <label>Payment Method</label>
          <select id="bankPaymentMethod">
            <option value="BANK">Bank Account</option>
            <option value="UPI">UPI</option>
          </select>
        </div>

        <div style="margin-bottom:16px;">
          <label>UPI ID (for UPI)</label>
          <input type="text" id="upiId" placeholder="example@upi" autocomplete="off">
        </div>

        <div
          style="margin-bottom:16px;"
        >

          <label>
            Bank Name
          </label>

          <input
            type="text"
            id="bankName"
            placeholder="e.g. State Bank of India"
            autocomplete="organization"
            maxlength="100"
            required
          >

        </div>


        <div
          style="margin-bottom:16px;"
        >

          <label>
            Account Holder Name
          </label>

          <input
            type="text"
            id="accountHolderName"
            placeholder="Name as per bank account"
            autocomplete="name"
            maxlength="100"
            required
          >

        </div>


        <div
          style="margin-bottom:16px;"
        >

          <label>
            Account Number
          </label>

          <input
            type="password"
            id="accountNumber"
            placeholder="Enter account number"
            inputmode="numeric"
            autocomplete="off"
            maxlength="18"
            required
          >

        </div>


        <div
          style="margin-bottom:16px;"
        >

          <label>
            Confirm Account Number
          </label>

          <input
            type="password"
            id="confirmAccountNumber"
            placeholder="Re-enter account number"
            inputmode="numeric"
            autocomplete="off"
            maxlength="18"
            required
          >

        </div>


        <div
          style="margin-bottom:16px;"
        >

          <label>
            IFSC Code
          </label>

          <input
            type="text"
            id="ifsc"
            placeholder="e.g. SBIN0001234"
            maxlength="11"
            autocomplete="off"
            required
          >

        </div>


        <div
          id="bankAccountMsg"
          style="
            min-height:24px;
            margin-bottom:12px;
          "
        ></div>


        <div
          style="
            display:flex;
            justify-content:flex-end;
            gap:10px;
            flex-wrap:wrap;
          "
        >

          <button
            type="button"
            class="btn"
            id="cancelBankAccountBtn"
          >
            Cancel
          </button>


          <button
            type="submit"
            class="btn primary"
            id="saveBankAccountBtn"
          >
            Save Bank Account
          </button>

        </div>


      </form>

    </div>

  `;


  document.body.appendChild(
    modal
  );


  // ==========================================================
  // CLOSE
  // ==========================================================

  $("#closeBankAccountModal")
    ?.addEventListener(
      "click",
      closeBankAccountModal
    );


  $("#cancelBankAccountBtn")
    ?.addEventListener(
      "click",
      closeBankAccountModal
    );


  modal.addEventListener(
    "click",
    event => {

      if (
        event.target ===
        modal
      ) {

        closeBankAccountModal();

      }

    }
  );


  // ==========================================================
  // FORM
  // ==========================================================

  $("#bankAccountForm")
    ?.addEventListener(
      "submit",
      saveBankAccount
    );


  // ==========================================================
  // IFSC AUTO UPPERCASE
  // ==========================================================

  $("#ifsc")
    ?.addEventListener(
      "input",
      event => {

        event.target.value =
          event.target.value
            .toUpperCase()
            .replace(/\s/g, "");

      }
    );


  // ==========================================================
  // ACCOUNT NUMBER ONLY DIGITS
  // ==========================================================

  $("#accountNumber")
    ?.addEventListener(
      "input",
      event => {

        event.target.value =
          event.target.value
            .replace(/\D/g, "");

      }
    );


  $("#confirmAccountNumber")
    ?.addEventListener(
      "input",
      event => {

        event.target.value =
          event.target.value
            .replace(/\D/g, "");

      }
    );

}


// ============================================================
// OPEN BANK ACCOUNT MODAL
// ============================================================

function openBankAccountModal() {

  createBankAccountModal();


  const modal =
    $("#bankAccountModal");


  if (!modal) return;


  modal.hidden =
    false;


  if ($("#bankAccountForm")) {

    $("#bankAccountForm").reset();

  }


  if ($("#bankAccountMsg")) {

    $("#bankAccountMsg").textContent =
      "";

  }


  setTimeout(
    () => {

      $("#bankName")?.focus();

    },
    100
  );

}


window.openBankAccountModal =
  openBankAccountModal;


// ============================================================
// OPEN EDIT BANK ACCOUNT MODAL
// ============================================================

function openEditBankAccountModal(account) {

  createBankAccountModal();

  const modal =
    $("#bankAccountModal");

  if (!modal) return;


  modal.hidden = false;


  // Store account ID for update
  modal.dataset.editAccountId =
    account.id || "";


  // Change title
  const title =
    modal.querySelector(
      "#bankAccountModalTitle"
    );

  if (title) {

    title.textContent =
      "Edit Bank Account";

  }


  // Change button text
  const saveButton =
    $("#saveBankAccountBtn");

  if (saveButton) {

    saveButton.textContent =
      "Update Bank Account";

  }


  // Fill Bank Name
  $("#bankName").value =
    account.bankName ||
    account.bank ||
    "";


  // Fill Account Holder
  $("#accountHolderName").value =
    account.accountHolderName ||
    account.accountHolder ||
    account.holderName ||
    "";


  // Fill Account Number
  const accountNumber =
    account.accountNumber ||
    "";

  $("#accountNumber").value =
    String(accountNumber)
      .replace(/\D/g, "");


  $("#confirmAccountNumber").value =
    String(accountNumber)
      .replace(/\D/g, "");


  // Fill IFSC
  $("#ifsc").value =
    account.ifsc ||
    account.IFSC ||
    "";


  // Clear message
  const msg =
    $("#bankAccountMsg");

  if (msg) {

    msg.textContent = "";

  }

}  


// ============================================================
// CLOSE BANK ACCOUNT MODAL
// ============================================================

function closeBankAccountModal() {

  const modal =
    $("#bankAccountModal");


  if (modal) {

    modal.hidden =
      true;

  }

}


window.closeBankAccountModal =
  closeBankAccountModal;


// ============================================================
// SAVE BANK ACCOUNT
// ============================================================

async function saveBankAccount(event) {

  event.preventDefault();


  const msg =
    $("#bankAccountMsg");


  if (!msg) return;


  msg.textContent =
    "";


  const bankName =
    $("#bankName")
      ?.value
      ?.trim() || "";


  const accountHolderName =
    $("#accountHolderName")
      ?.value
      ?.trim() || "";


  const accountNumber =
    $("#accountNumber")
      ?.value
      ?.trim() || "";


  const confirmAccountNumber =
    $("#confirmAccountNumber")
      ?.value
      ?.trim() || "";


  const ifsc =
    $("#ifsc")
      ?.value
      ?.trim()
      ?.toUpperCase() || "";

  const method = $("#bankPaymentMethod")?.value || "BANK";
  const upiId = $("#upiId")?.value?.trim().toLowerCase() || "";

  // ==========================================================
  // VALIDATION
  // ==========================================================

  if (method === "BANK" && !bankName) {
    msg.textContent = "Bank name is required.";
    return;
  }


  if (
    bankName.length > 100
  ) {

    msg.textContent =
      "Bank name is too long.";

    return;

  }


  if (!accountHolderName) {

    msg.textContent =
      "Account holder name is required.";

    return;

  }


  if (
    accountHolderName.length > 100
  ) {

    msg.textContent =
      "Account holder name is too long.";

    return;

  }


  if (
    !/^\d{9,18}$/.test(
      accountNumber
    )
  ) {

    msg.textContent =
      "Enter a valid account number.";

    return;

  }


  if (
    accountNumber !==
    confirmAccountNumber
  ) {

    msg.textContent =
      "Account numbers do not match.";

    return;

  }


  if (
    !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(
      ifsc
    )
  ) {

    msg.textContent =
      "Enter a valid IFSC code.";

    return;

  }


  // ==========================================================
  // BUTTON LOCK
  // ==========================================================

  const saveButton =
    $("#saveBankAccountBtn");


  setButtonLoading(
    saveButton,
    true,
    "Saving...",
    "Save Bank Account"
  );


  try {

    const editAccountId = $("#bankAccountModal")?.dataset?.editAccountId;

    if (editAccountId) {
      await api(
        `/api/bank-accounts/${encodeURIComponent(editAccountId)}`,
        {
          method: "PUT",
          body: JSON.stringify({
            bankName,
            accountHolderName,
            accountNumber,
            ifsc,
            method,
            upiId
          })
        }
      );

      msg.textContent = "Bank account updated successfully.";
    } else {
      await api(
        "/api/bank-accounts",
        {
          method: "POST",
          body: JSON.stringify({
            bankName,
            accountHolderName,
            accountNumber,
            ifsc,
            method,
            upiId
          })
        }
      );

      msg.textContent = "Bank account added successfully.";
    }


    msg.textContent =
      "Bank account added successfully.";


    setTimeout(
      async () => {

        closeBankAccountModal();

        await loadBankAccounts();

      },
      800
    );


  } catch (error) {

    console.error(
      "Add bank account error:",
      error
    );


    if (
      !handleAuthError(error)
    ) {

      msg.textContent =
        error.message ||
        "Unable to add bank account.";

    }

  } finally {

    setButtonLoading(
      saveButton,
      false,
      "Saving...",
      "Save Bank Account"
    );

  }

}


// ============================================================
// QUICK DEPOSIT
// ============================================================

function handleQuickDeposit() {

  const button =
    $("#depositBtn");


  if (button) {

    button.click();

  } else {

    openDeposit();

  }

}


// ============================================================
// QUICK WITHDRAW
// ============================================================

function handleQuickWithdraw() {

  const button =
    $("#withdrawBtn");


  if (button) {

    button.click();

  } else {

    openWithdrawal();

  }

}


// ============================================================
// EVENT DELEGATION FOR TRANSACTIONS
// ============================================================

async function handleTransactionClick(event) {

  const button =
    event.target.closest(
      "button[data-action]"
    );

  if (!button) return;

  const action =
    button.dataset.action;

  const transactionId =
    button.dataset.id;

  const transactionType =
    (
      button.dataset.type ||
      ""
    ).toUpperCase();


  // ==========================================================
  // VERIFY
  // ==========================================================

  if (action === "verify") {

    // ========================================================
    // DEPOSIT VERIFY
    // Investor already uploaded payment proof.
    // Admin DOES NOT upload another proof.
    // ========================================================

    if (transactionType === "DEPOSIT") {

      try {

        await setStatus(
          transactionId,
          "VERIFIED"
        );

      } catch (error) {

        console.error(
          "Deposit verification failed:",
          error
        );

        alert(
          error.message ||
          "Unable to verify deposit."
        );

      }

      return;
    }


    // ========================================================
    // WITHDRAWAL VERIFY
    // Admin payment proof is required.
    // ========================================================

    if (transactionType === "WITHDRAWAL") {

      const input =
        document.createElement("input");

      input.type = "file";
      input.accept = "image/*";
      input.style.display = "none";

      document.body.appendChild(input);


      input.addEventListener(
        "change",
        async () => {

          const file =
            input.files?.[0];


          // No file selected
          if (!file) {

            input.remove();

            alert(
              "Admin payment proof screenshot is required."
            );

            return;
          }


          // Only image files allowed
          if (
            !file.type.startsWith("image/")
          ) {

            input.remove();

            alert(
              "Please select an image screenshot."
            );

            return;
          }


          // Convert screenshot to Data URL
          const reader =
            new FileReader();


          reader.onload = async () => {

            try {

              await setStatus(
                transactionId,
                "VERIFIED",
                {
                  fileName:
                    file.name,

                  data:
                    reader.result
                }
              );

            } catch (error) {

              console.error(
                "Withdrawal verification failed:",
                error
              );

              alert(
                error.message ||
                "Unable to verify withdrawal."
              );

            } finally {

              input.remove();

            }

          };


          reader.onerror = () => {

            alert(
              "Unable to read the payment proof screenshot."
            );

            input.remove();

          };


          reader.readAsDataURL(file);

        }
      );


      // Open image picker
      input.click();

      return;
    }

    if (transactionType === "CASHBACK_WITHDRAWAL" || transactionType === "LEVEL_INCOME_WITHDRAWAL") {
      const input = document.createElement("input");
      input.type = "file"; input.accept = "image/*"; input.style.display = "none";
      document.body.appendChild(input);
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) { input.remove(); return; }
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            await api("/api/admin/special-withdrawal-status", {
              method:"POST",
              body:JSON.stringify({id:transactionId,status:"VERIFIED",adminProof:{fileName:file.name,data:reader.result}})
            });
            await load(true);
          } catch(e) { alert(e.message || "Unable to approve special withdrawal."); }
          finally { input.remove(); }
        };
        reader.readAsDataURL(file);
      };
      input.click();
      return;
    }


    // Unknown transaction type
    alert(
      "Transaction type could not be determined."
    );

    return;
  }


  // ==========================================================
  // REJECT
  // ==========================================================

  else if (
    action === "reject"
  ) {

    try {
      if (transactionType === "CASHBACK_WITHDRAWAL" || transactionType === "LEVEL_INCOME_WITHDRAWAL") {
        await api("/api/admin/special-withdrawal-status", {
          method:"POST",
          body:JSON.stringify({id:transactionId,status:"REJECTED"})
        });
        await load(true);
      } else {
        await setStatus(
          transactionId,
          "REJECTED"
        );
      }

    } catch (error) {

      console.error(
        "Transaction rejection failed:",
        error
      );

      alert(
        error.message ||
        "Unable to reject transaction."
      );

    }

    return;
  }


  // ==========================================================
  // VIEW INVESTOR DEPOSIT PROOF
  // ==========================================================

  else if (
    action === "proof"
  ) {

    viewProof(
      button.dataset.url,
      button.dataset.utr || ""
    );

    return;
  }


  // ==========================================================
  // VIEW ADMIN WITHDRAWAL PAYMENT PROOF
  // ==========================================================

  else if (
    action === "admin-proof"
  ) {

    viewProof(
      button.dataset.url,
      button.dataset.utr || ""
    );

    return;
  }

}

// ============================================================
// ESC KEY - MODALS
// ============================================================

function handleEscapeKey(event) {

  if (
    event.key !==
    "Escape"
  ) {

    return;

  }


  if (
    $("#modal") &&
    !$("#modal").hidden
  ) {

    closeDeposit();

  }


  if (
    $("#withdrawalModal") &&
    !$("#withdrawalModal").hidden
  ) {

    closeWithdrawal();

  }


  if (
    $("#proofModal") &&
    !$("#proofModal").hidden
  ) {

    closeProof();

  }


  if (
    $("#bankAccountModal") &&
    !$("#bankAccountModal").hidden
  ) {

    closeBankAccountModal();

  }

}


// ============================================================
// INITIALIZE
// ============================================================

function setMobileSidebar(open) {
  const sidebar = $(".sidebar");
  const overlay = $("#sidebarOverlay");
  const menuBtn = $("#mobileMenuBtn");
  if (!sidebar || !overlay) return;

  const isOpen = Boolean(open);
  sidebar.classList.toggle("mobile-open", isOpen);
  overlay.classList.toggle("open", isOpen);
  overlay.setAttribute("aria-hidden", isOpen ? "false" : "true");
  if (menuBtn) menuBtn.setAttribute("aria-expanded", isOpen ? "true" : "false");
  document.body.classList.toggle("mobile-sidebar-open", isOpen);
}

function initializeMobileSidebar() {
  const menuBtn = $("#mobileMenuBtn");
  const closeBtn = $("#mobileSidebarClose");
  const overlay = $("#sidebarOverlay");

  menuBtn?.addEventListener("click", () => setMobileSidebar(true));
  closeBtn?.addEventListener("click", () => setMobileSidebar(false));
  overlay?.addEventListener("click", () => setMobileSidebar(false));

  $$(".nav-item[data-section]").forEach(button => {
    button.addEventListener("click", () => setMobileSidebar(false));
  });
}

function initializePortal() {

  initializeMobileSidebar();

  const dashboardProfile =
    $("#profilePanel");

  if (dashboardProfile) {
    dashboardProfile.remove();
  }

  // ==========================================================
  // LOGIN
  // ==========================================================

  const loginForm =
    $("#loginForm");


  if (loginForm) {

    loginForm.addEventListener(
      "submit",
      handleLogin
    );

  }

  document.addEventListener("click", async (event) => {
    const jump = event.target.closest("[data-section-jump]");
    if (jump) {
      event.preventDefault();
      const target = jump.dataset.sectionJump;
      if (target) showSection(target);
      return;
    }

    const forgotPasswordLink = event.target.closest("#forgotPasswordLink");

    if (!forgotPasswordLink) return;

    event.preventDefault();

    const email = prompt("Enter your registered email:");

    if (!email || !email.trim()) {
        return;
    }

    try {
        const result = await api("/api/forgot-password", {
            method: "POST",
            body: JSON.stringify({
                email: email.trim()
            })
        });

        alert(result.message || "OTP sent successfully.");

        if (!result.ok) {
            return;
        }

        const otp = prompt("Enter the OTP sent to your email:");

        if (!otp || !otp.trim()) {
            return;
        }

        const newPassword = prompt("Enter your new password:");

        if (!newPassword || !newPassword.trim()) {
            return;
        }

        const confirmPassword = prompt("Confirm your new password:");

        if (!confirmPassword || !confirmPassword.trim()) {
            return;
        }

        if (newPassword !== confirmPassword) {
            alert("Passwords do not match.");
            return;
        }

        const resetResult = await api("/api/reset-password", {
            method: "POST",
            body: JSON.stringify({
                email: email.trim(),
                otp: otp.trim(),
                newPassword: newPassword
            })
        });

        alert(
            resetResult.message ||
            (resetResult.ok
                ? "Password reset successfully."
                : "Password reset failed.")
        );

    } catch (error) {
        alert(error.message || "Failed to reset password.");
    }
});

  


  // ==========================================================
  // LOGOUT
  // ==========================================================

  const logout =
    $("#logout");


  if (logout) {

    logout.addEventListener(
      "click",
      handleLogout
    );

  }


  // ==========================================================
  // PROFILE
  // ==========================================================

  const profileForm =
    $("#profileForm");


  if (profileForm) {

    profileForm.addEventListener(
      "submit",
      handleProfileSubmit
    );

  }


  // ==========================================================
  // CHANGE PASSWORD
  // ==========================================================

  const changePasswordBtn = $('#changePasswordBtn');
  if (changePasswordBtn) {
    changePasswordBtn.addEventListener('click', async () => {
      const currentPassword = $('#currentPassword')?.value || '';
      const newPassword = $('#newPassword')?.value || '';
      const confirmPassword = $('#confirmPassword')?.value || '';
      const msg = $('#passwordChangeMsg');
      try {
        const result = await api('/api/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword, confirmPassword }) });
        if (msg) msg.textContent = result.message || 'Password changed successfully.';
        if ($('#currentPassword')) $('#currentPassword').value = '';
        if ($('#newPassword')) $('#newPassword').value = '';
        if ($('#confirmPassword')) $('#confirmPassword').value = '';
      } catch (error) {
        if (msg) msg.textContent = error.message || 'Unable to change password.';
      }
    });
  }

  // ==========================================================
  // DEPOSIT
  // ==========================================================

  const depositBtn =
    $("#depositBtn");


  if (depositBtn) {

    depositBtn.addEventListener(
      "click",
      openDeposit
    );

  }


  const closeModal =
    $("#closeModal");


  if (closeModal) {

    closeModal.addEventListener(
      "click",
      closeDeposit
    );

  }


  const depositForm =
    $("#depositForm");


  if (depositForm) {

    depositForm.addEventListener(
      "submit",
      handleDeposit
    );

  }


  const paymentScreenshot =
    $("#paymentScreenshot");


  if (paymentScreenshot) {

    paymentScreenshot.addEventListener(
      "change",
      handleScreenshotChange
    );

  }


  // ==========================================================
  // WITHDRAWAL
  // ==========================================================

  const withdrawBtn =
    $("#withdrawBtn");


  if (withdrawBtn) {

    withdrawBtn.addEventListener(
      "click",
      openWithdrawal
    );

  }


  const closeWithdrawalModal =
    $("#closeWithdrawalModal");


  if (closeWithdrawalModal) {

    closeWithdrawalModal.addEventListener(
      "click",
      closeWithdrawal
    );

  }


  const withdrawalForm =
    $("#withdrawalForm");


  if (withdrawalForm) {

    withdrawalForm.addEventListener(
      "submit",
      handleWithdrawal
    );

  }


  // ==========================================================
  // PROOF
  // ==========================================================

  const closeProofModal =
    $("#closeProofModal");


  if (closeProofModal) {

    closeProofModal.addEventListener(
      "click",
      closeProof
    );

  }


  // ==========================================================
  // OUTSIDE CLICK - DEPOSIT
  // ==========================================================

  const modal =
    $("#modal");


  if (modal) {

    modal.addEventListener(
      "click",
      event => {

        if (
          event.target ===
          modal
        ) {

          closeDeposit();

        }

      }
    );

  }


  // ==========================================================
  // OUTSIDE CLICK - WITHDRAWAL
  // ==========================================================

  const withdrawalModal =
    $("#withdrawalModal");


  if (withdrawalModal) {

    withdrawalModal.addEventListener(
      "click",
      event => {

        if (
          event.target ===
          withdrawalModal
        ) {

          closeWithdrawal();

        }

      }
    );

  }


  // ==========================================================
  // OUTSIDE CLICK - PROOF
  // ==========================================================

  const proofModal =
    $("#proofModal");


  if (proofModal) {

    proofModal.addEventListener(
      "click",
      event => {

        if (
          event.target ===
          proofModal
        ) {

          closeProof();

        }

      }
    );

  }


  // ==========================================================
  // TRANSACTION ACTIONS
  // ==========================================================

  const txBody =
    $("#txBody");


  if (txBody) {

    txBody.addEventListener(
      "click",
      handleTransactionClick
    );

  }


  // ==========================================================
  // ADMIN INVESTMENT / PERFORMANCE / PROFILE REQUESTS
  // ==========================================================

  const generateInvestorIdBtn =
    $("#generateInvestorIdBtn");

  if (generateInvestorIdBtn) {
    generateInvestorIdBtn.addEventListener("click", suggestNextInvestorId);
  }

  const createInvestorForm =
    $("#createInvestorForm");

  if (createInvestorForm) {
    createInvestorForm.addEventListener(
      "submit",
      handleCreateInvestor
    );
  }

  const refreshAdminInvestorsBtn =
    $("#refreshAdminInvestorsBtn");

  if (refreshAdminInvestorsBtn) {
    refreshAdminInvestorsBtn.addEventListener(
      "click",
      async () => {
        await loadAdminInvestors();
        await loadProfileRequests();
      }
    );
  }

  const adminInvestorBody =
    $("#adminInvestorBody");

  if (adminInvestorBody) {
    adminInvestorBody.addEventListener(
      "click",
      event => {
        const button =
          event.target.closest(
            "[data-investor-excel]"
          );

        if (button) {
          downloadInvestorExcel(
            button.dataset.investorExcel
          );
        }
      }
    );
  }

  const companyPerformanceExcelButton =
  $("#downloadCompanyPerformanceExcel");

if (companyPerformanceExcelButton) {
  companyPerformanceExcelButton.addEventListener(
    "click",
    () => {
      downloadCompanyPerformanceExcel();
    }
  );
}

  const profileRequestBody =
    $("#profileRequestBody");

  if (profileRequestBody) {
    profileRequestBody.addEventListener(
      "click",
      event => {
        const button =
          event.target.closest(
            "[data-profile-request]"
          );

        if (button) {
          handleProfileRequestAction(
            button
          );
        }
      }
    );
  }

  const companyProfitLossForm = $('#companyProfitLossForm');
  if (companyProfitLossForm) companyProfitLossForm.addEventListener('submit', uploadCompanyProfitLossImage);

  if ($('#companyProfitLossDate')) {
    $('#companyProfitLossDate').value = new Date().toISOString().slice(0, 10);
  }

  const investorWithdrawalStatementBtn = $('#downloadInvestorWithdrawalStatementBtn');
  if (investorWithdrawalStatementBtn) investorWithdrawalStatementBtn.addEventListener('click', downloadWithdrawalStatement);

  const adminWithdrawalStatementBtn = $('#downloadAdminWithdrawalStatementBtn');
  if (adminWithdrawalStatementBtn) adminWithdrawalStatementBtn.addEventListener('click', downloadWithdrawalStatement);

  $('#adminInvestorAccessBody')?.addEventListener('click', event => {
    const button = event.target.closest('[data-login-as-investor]');
    if (button) loginAsInvestor(button.dataset.loginAsInvestor);
  });

  $('#returnToAdminBtn')?.addEventListener('click', returnToAdminPortal);
  $('#refreshAdminNetworkBtn')?.addEventListener('click', async () => {
    await loadAdminInvestorRecords();
    renderAdminNetworkOverview();
  });

  // ==========================================================
  // NAVIGATION
  // ==========================================================

  $$("[data-section]")
    .forEach(
      button => {

        button.addEventListener(
          "click",
          event => {

            /*
              Prevent normal button/link behaviour
              when navigation is handled by JS.
            */

            if (
              button.tagName ===
              "A"
            ) {

              event.preventDefault();

            }


            const section =
              button.dataset.section;


            if (section) {

              showSection(
                section
              );

            }

          }
        );

      }
    );


  
  // ==========================================================
  // PHASE 3 PAGE ACTIONS
  // ==========================================================

  $('#openDepositPageBtn')?.addEventListener('click', () => $('#depositBtn')?.click());
  $('#openWithdrawPageBtn')?.addEventListener('click', () => $('#withdrawBtn')?.click());
  $('#openCashbackWithdrawBtn')?.addEventListener('click', () => submitSpecialWithdrawal('cashback'));
  $('#openLevelIncomeWithdrawBtn')?.addEventListener('click', () => submitSpecialWithdrawal('level'));

  $('#downloadDepositExcelBtn')?.addEventListener('click', () => {
    const rows = pageTransactions('DEPOSIT').map(t => [t.id, t.amount, formatDate(t.createdAt || t.date), timeOnly(t.createdAt), t.status || '']);
    downloadExcelXml('SPARTNER_Deposits.xlsx','Deposits',['Deposit ID','Amount','Date','Time','Status'],rows);
  });

  $('#downloadWithdrawPageExcelBtn')?.addEventListener('click', () => {
    const rows = pageTransactions('WITHDRAWAL').map(t => [t.id, t.amount, formatDate(t.createdAt || t.date), timeOnly(t.createdAt), t.status || '']);
    downloadExcelXml('SPARTNER_Withdrawals.xlsx','Withdrawals',['Withdrawal ID','Amount','Date','Time','Status'],rows);
  });

  $('#downloadCashbackExcelBtn')?.addEventListener('click', () => {
    if (isAdminUser(currentUser)) {
      const rows = (adminInvestorRecords || []).map(u => [u.id, u.name, u.totalDeposit, u.cashBackEarned || 0, u.cashBack || 0]);
      downloadExcelXml('SPARTNER_Admin_Cashback.xlsx','Cash Back',['Investor ID','Name','Verified Deposits','Cash Back Earned','Available Cash Back'],rows);
      return;
    }
    const rows = (currentUser?.cashbackRecords || []).map(x => [x.depositId, x.amount, x.cashback, formatDate(x.date)]);
    downloadExcelXml('SPARTNER_Cashback.xlsx','Cash Back',['Deposit ID','Deposit','Cash Back 5%','Date'],rows);
  });

  $('#downloadLevelIncomeExcelBtn')?.addEventListener('click', () => {
    if (isAdminUser(currentUser)) {
      const rows = [];
      (adminInvestorRecords || []).forEach(u => (Array.isArray(u.levelIncomeLedger) ? u.levelIncomeLedger : []).forEach(e => rows.push([u.id,u.name,e.date,e.level,e.sourceUserId,e.sourceName,e.sourceROI,e.rate,e.amount])));
      downloadExcelXml('SPARTNER_Admin_Level_Incomes.xlsx','Level Incomes',['Investor ID','Investor Name','Date','Level','Source Investor','Source Name','Member ROI','Rate %','Level Income'],rows);
      return;
    }
    const rows = buildLevelIncomeDailySummary(currentUser?.levelIncomeLedger || []).map(x => [x.date,x.aIncome,x.bIncome,x.cIncome,x.dailyTotal]);
    downloadExcelXml('SPARTNER_Level_Incomes.xlsx','Level Incomes',['Date','A Income','B Income','C Income','Daily Total'],rows);
  });

  $('#downloadTransactionsExcelBtn')?.addEventListener('click', () => {
    const rows = pageTransactions().map(t => [t.id,t.type,t.amount,t.utrNumber||'',t.status||'',formatDate(t.createdAt||t.date)]);
    downloadExcelXml('SPARTNER_Transactions.xlsx','Transactions',['Transaction ID','Type','Amount','UTR','Status','Date'],rows);
  });

  $('#downloadRoiExcelBtn')?.addEventListener('click', () => {
    if (isAdminUser(currentUser)) {
      const rows = [];
      (adminInvestorRecords || []).forEach(u => (Array.isArray(u.roiHistory) ? u.roiHistory : []).forEach(x => rows.push([u.id,u.name,x.date,x.openingBalance,x.roiRate,x.amount,x.closingBalance])));
      downloadExcelXml('SPARTNER_Admin_ROI_History.xlsx','ROI History',['Investor ID','Name','Date','Opening Balance','ROI %','ROI Amount','Closing Balance'],rows);
      return;
    }
    const rows = (currentUser?.roiHistory || []).map(x => [x.date,x.openingBalance,x.roiRate,x.amount,x.closingBalance]);
    downloadExcelXml('SPARTNER_ROI_History.xlsx','ROI History',['Date','Opening Balance','ROI %','ROI Amount','Closing Balance'],rows);
  });

  $('#downloadRoiHistoryPageExcelBtn')?.addEventListener('click', () => {
    const rows = (currentUser?.roiHistory || []).map(x => [x.date,x.openingBalance,x.roiRate,x.amount,x.closingBalance]);
    downloadExcelXml('SPARTNER_ROI_History.xlsx','ROI History',['Date','Opening Balance','ROI %','ROI Amount','Closing Balance'],rows);
  });



  $('#adminInvestorBody')?.addEventListener('click', event => {
    const row = event.target.closest('[data-admin-investor]');
    if (row) openAdminInvestorDetails(row.dataset.adminInvestor);
  });

  $('#depositPageBody')?.addEventListener('click', async event => {
    const row = event.target.closest('[data-admin-deposit-investor]');
    if (!row) return;
    const id = row.dataset.adminDepositInvestor;
    const detail = document.querySelector(`#admin-deposit-detail-${CSS.escape(id)}`);
    if (!detail) return;
    const wasHidden = detail.hidden;
    document.querySelectorAll('#depositPageBody .admin-detail-row').forEach(r => r.hidden = true);
    if (!wasHidden) return;
    detail.hidden = false;
    const body = document.querySelector(`#admin-deposit-detail-body-${CSS.escape(id)}`);
    try {
      const data = await api(`/api/admin/investor-transactions?userId=${encodeURIComponent(id)}`);
      const deposits = (data.transactions || []).filter(t => String(t.type||'').toUpperCase() === 'DEPOSIT');
      body.innerHTML = deposits.length ? deposits.map(t => `<tr><td><strong>${fmt(t.amount)}</strong></td><td>${escapeHtml(formatDate(t.createdAt||t.date))}</td><td>${escapeHtml(timeOnly(t.createdAt))}</td><td class="${statusClass(t.status)}">${escapeHtml(t.status||'')}</td><td>${escapeHtml(t.utrNumber||'—')}</td><td>${t.paymentScreenshot ? `<button class="mini" type="button" onclick="viewProof('${escapeHtml(t.paymentScreenshot)}','${escapeHtml(t.utrNumber||'')}')">View</button>` : '—'}</td></tr>`).join('') : '<tr><td colspan="6">No deposits found.</td></tr>';
    } catch(e) { body.innerHTML = `<tr><td colspan="6" class="error">${escapeHtml(e.message)}</td></tr>`; }
  });

  $('#levelIncomeBody')?.addEventListener('click', event => {
    if (!isAdminUser(currentUser)) return;
    const row = event.target.closest('[data-admin-level-investor]');
    if (!row) return;
    const id = row.dataset.adminLevelInvestor;
    const detail = document.querySelector(`#admin-level-detail-${CSS.escape(id)}`);
    if (!detail) return;
    const wasHidden = detail.hidden;
    document.querySelectorAll('#levelIncomeBody .admin-detail-row').forEach(r => r.hidden = true);
    if (!wasHidden) return;
    detail.hidden = false;
  });

  $('#adminNetworkBody')?.addEventListener('click', event => {
    const row = event.target.closest('[data-admin-network-investor]');
    if (!row) return;
    const id = row.dataset.adminNetworkInvestor;
    document.querySelectorAll('#adminNetworkBody tr').forEach(r => r.classList.remove('selected-row'));
    row.classList.add('selected-row');
    const node = document.querySelector(`[data-admin-network-node="${CSS.escape(id)}"]`);
    node?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

// ==========================================================
  // QUICK DEPOSIT
  // ==========================================================

  const quickDeposit =
    $("#quickDeposit");


  if (quickDeposit) {

    quickDeposit.addEventListener(
      "click",
      handleQuickDeposit
    );

  }


  // ==========================================================
  // QUICK WITHDRAW
  // ==========================================================

  const quickWithdraw =
    $("#quickWithdraw");


  if (quickWithdraw) {

    quickWithdraw.addEventListener(
      "click",
      handleQuickWithdraw
    );

  }


  // ==========================================================
  // ESCAPE
  // ==========================================================

  document.addEventListener(
    "keydown",
    handleEscapeKey
  );

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") setMobileSidebar(false);
  });


  // ==========================================================
  // INITIAL DASHBOARD
  // ==========================================================

  load(
    false
  );

  const savePerformanceBtn = document.getElementById("saveCompanyPerformanceBtn");

if (savePerformanceBtn) {
    savePerformanceBtn.addEventListener("click", async function () {
    try {
        const date =
            document.querySelector("#companyPerformanceInputDate")?.value?.trim() ||
            new Date().toISOString().slice(0, 10);

        const openingBalance =
            document.querySelector("#companyCurrentBalance")?.textContent?.trim() || "0";

        const todayProfit =
            document.querySelector("#companyTodayProfit")?.textContent?.trim() || "0";

        const todayLoss =
            document.querySelector("#companyTodayLoss")?.textContent?.trim() || "0";

        const adminWithdrawal =
            document.querySelector("#companyAdminWithdrawal")?.textContent?.trim() || "0";

        const result = await api("/api/company-performance", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                date: date,
                openingBalance: Number(openingBalance.replace(/[₹,]/g, "")) || 0,
                todayProfit: Number(todayProfit.replace(/[₹,]/g, "")) || 0,
                todayLoss: Number(todayLoss.replace(/[₹,]/g, "")) || 0,
                adminWithdrawal: Number(adminWithdrawal.replace(/[₹,]/g, "")) || 0
            })
        });

        alert(result.message || "Performance saved successfully");

    } catch (error) {
        alert(error.message || "Unable to save performance");
    }
});
}

}


  // ============================================================
  // START
  // ============================================================

  if (
    document.readyState ===
    "loading"
  ) {

    document.addEventListener(
      "DOMContentLoaded",
      initializePortal
    );

  } else {

    initializePortal();

  }
