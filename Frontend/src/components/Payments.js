import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiUrl } from "../services/api";

function Payments() {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
// ...
const [showSubmissionWarningModal, setShowSubmissionWarningModal] = useState(false);

  // Submissions & mileage since last payment
  const [submissions, setSubmissions] = useState(0);
  const [mileage, setMileage] = useState(0);
  const [assignmentsCount, setAssignmentsCount] = useState(0);
  // YTD data
  const [ytdMiles, setYtdMiles] = useState(0); // YTD miles
  // For YTD dollars, we rely on user.ytd from GET /admin/users

  // Payment rates
  const [perSubmissionRate, setPerSubmissionRate] = useState(25);
  const [perMileRate, setPerMileRate] = useState(0.5);

  // Calculated total for this pay period
  const [totalPayment, setTotalPayment] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const detailRequest = useRef(0);

  // Date range display
  const [currentWeek, setCurrentWeek] = useState("");
  const token = localStorage.getItem("token");
  const navigate = useNavigate();

  // ===== Utility: Current Week Range =====
  function getCurrentWeekRange() {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 = Sunday
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - dayOfWeek);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);

    const formatDate = (date) =>
      `${date.getMonth() + 1}/${date.getDate()}/${date.getFullYear()}`;

    return `${formatDate(startOfWeek)} - ${formatDate(endOfWeek)}`;
  }

  useEffect(() => {
    setCurrentWeek(getCurrentWeekRange());
  }, []);

  // ===== Fetch Users (Including YTD $) =====
  useEffect(() => {
    fetch(apiUrl("/admin/users"), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        // data is an array of users with:
        //   user.username, user._id, user.lastPaidDate, user.status, user.ytd (dollars)
        const today = new Date();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());

        const usersWithStatus = data.map((user) => {
          if (user.lastPaidDate && new Date(user.lastPaidDate) >= startOfWeek) {
            user.status = "PAID";
          } else {
            user.status = "Awaiting Payment";
          }
          return user;
        });
        setUsers(usersWithStatus);
      })
      .catch((err) => console.error("Error fetching users:", err));
  }, [token]);

  // ===== Fetch Data for a Clicked User =====
  async function fetchUserData(userId) {
    const requestId = ++detailRequest.current;
    setSelectedUser(userId);
    setLoadingDetails(true);
    setError("");
    setTotalPayment(null);
    try {
      const response = await fetch(
        apiUrl(`/admin/payment-summary/${userId}`),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load payment details.");
      if (requestId !== detailRequest.current) return;
      setSubmissions(data.submissionCount);
      setMileage(data.currentMiles);
      setAssignmentsCount(data.assignmentCount);
      setYtdMiles(data.ytdMiles || 0);
      setUsers((current) => current.map((user) =>
        user._id === userId ? { ...user, ytd: data.ytdPayments || 0 } : user
      ));
    } catch (requestError) {
      if (requestId === detailRequest.current) setError(requestError.message);
    } finally {
      if (requestId === detailRequest.current) setLoadingDetails(false);
    }
  }
        
  // ===== Calculate Payment for this Pay Period =====
  function calculatePayment() {
    const total = submissions * perSubmissionRate + mileage * perMileRate;
    setTotalPayment(total);
  }

  // ===== Log Payment & Reset Data =====
  // Call this function when the admin clicks the "Log Payment" button
function logPayment() {
    if (!totalPayment || totalPayment <= 0) {
      alert("Payment total is $0. Cannot log a $0 payment.");
      return;
    }
  
    // Check if submissions exceed assignments; if so, show the custom modal
    if (submissions > assignmentsCount) {
      setShowSubmissionWarningModal(true);
      return;
    }
  
    // Otherwise, proceed directly with logging payment
    proceedWithPayment();
  }
  
  // This function actually performs the API call to log the payment
  function proceedWithPayment(allowSubmissionMismatch = false) {
    setProcessing(true);
    setError("");
    fetch(apiUrl("/admin/process-payment"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        userId: selectedUser,
        perSubmissionRate,
        perMileRate,
        allowSubmissionMismatch,
      }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          if (data.code === "SUBMISSION_MISMATCH") {
            setShowSubmissionWarningModal(true);
            return;
          }
          throw new Error(data.error || "Unable to process payment.");
        }
        alert("Payment logged!");
  
        // Mark that user as "Paid" locally
        setUsers((prevUsers) =>
          prevUsers.map((user) =>
            user._id === selectedUser ? { ...user, status: "PAID" } : user
          )
        );
  
        // Clear local states
        setSubmissions(0);
        setMileage(0);
        setTotalPayment(null);
  
        // ✅ Fetch user data again to refresh YTD values
        await fetchUserData(selectedUser);
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setProcessing(false));
  }  

  return (
    <div className="payments-container">
      <h1 className="payments-header">Payments 💰</h1>
      <button className="back-button" onClick={() => navigate("/dashboard")}>
        ← Back to Dashboard
      </button>
      <h2 className="payments-subheader">Week: {currentWeek}</h2>
      {error && <p className="error">{error}</p>}
      <div className="table-wrapper">
        <table className="payments-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Status</th>
              <th>YTD Miles</th>
              <th>YTD $</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr
                key={user._id}
                onClick={() => fetchUserData(user._id)}
                className="clickable-row"
              >
                <td>{user.username}</td>
                <td className={user.status === "PAID" ? "status-paid" : "status-awaiting"}>
                  {user.status}
                </td>
                <td>{user._id === selectedUser ? ytdMiles.toFixed(2) : "—"}</td>
                <td>
                  {user._id === selectedUser
                    ? `$${(user.ytd || 0).toFixed(2)}`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedUser && loadingDetails && <p>Loading payment details...</p>}
      {selectedUser && !loadingDetails && (
        <div className="payment-card">
          <h3 className="card-title">Payment Details</h3>
          <p>
            <strong>Submissions (since last payment):</strong>{" "}
            <span style={{ color: submissions > assignmentsCount ? "red" : "inherit" }}>
              {submissions}
            </span>
          </p>
          <p>
            <strong>Miles Driven (since last payment):</strong> {mileage}
          </p>
          <label>
            Per Submission Rate ($):
            <input
              type="number"
              value={perSubmissionRate}
              onChange={(e) => setPerSubmissionRate(Number(e.target.value))}
              className="payments-input"
            />
          </label>
          <label>
            Per Mile Rate ($):
            <input
              type="number"
              value={perMileRate}
              onChange={(e) => setPerMileRate(Number(e.target.value))}
              className="payments-input"
            />
          </label>
          <button onClick={calculatePayment} className="payments-button">
            Calculate Payment
          </button>
          {totalPayment !== null && (
            <h2 className="total-payment">Total Payment: ${totalPayment.toFixed(2)}</h2>
          )}
          <button
            onClick={logPayment}
            className="payments-button payments-success"
            disabled={processing || !totalPayment || totalPayment <= 0}
          >
            {processing ? "Processing..." : "Log Payment"}
          </button>
        </div>
      )}

      {/* Custom Modal for Submission vs. Assignment Warning */}
      {showSubmissionWarningModal && (
        <div className="modal-overlay">
          <div className="modal">
            <div
              className="modal-banner"
              style={{
                backgroundColor: "#f0f0f0",
                padding: "10px",
                borderRadius: "5px",
                marginBottom: "10px",
                textAlign: "center",
                fontSize: "1.2em",
                fontWeight: "bold",
              }}
            >
              🤔 Hmm... Are you sure?
            </div>
            <h2>Submissions Exceed Assignments</h2>
            <p>
              The number of submissions ({submissions}) exceeds the number of assignments (
              {assignmentsCount}) for this user. Are you sure you want to proceed?
            </p>
            <div style={{ marginTop: "10px" }}>
              <button
                onClick={() => {
                  setShowSubmissionWarningModal(false);
                  proceedWithPayment(true);
                }}
                className="payments-button"
              >
                Confirm
              </button>
              <button
                onClick={() => setShowSubmissionWarningModal(false)}
                className="payments-button"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Payments;
