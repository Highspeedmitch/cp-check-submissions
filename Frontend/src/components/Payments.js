import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

function Payments() {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);

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
    fetch("https://cp-check-submissions-dev-backend.onrender.com/admin/users", {
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
  function fetchUserData(userId) {
    setSelectedUser(userId);

    // Submissions since last payment
    fetch(
      `https://cp-check-submissions-dev-backend.onrender.com/admin/user-submissions/${userId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    )
      .then((res) => res.json())
      .then((data) => setSubmissions(data.count))
      .catch((err) => console.error("Error fetching submissions:", err));

    // Miles since last payment + YTD miles
    fetch(
      `https://cp-check-submissions-dev-backend.onrender.com/api/mileage/user/${userId}`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    )
      .then((res) => res.json())
      .then((data) => {
        // data.totalMiles = miles since last payment
        // data.ytdMiles   = sum of miles paid so far this year
        setMileage(data.totalMiles);
        setYtdMiles(data.ytdMiles || 0);
      })
      .catch((err) => console.error("Error fetching mileage:", err));
     
    // Fetch assignments count since last payment for the selected user
    fetch(`https://cp-check-submissions-dev-backend.onrender.com/api/assignments/count/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setAssignmentsCount(data.count))
      .catch((err) => console.error("Error fetching assignment count:", err));    
  }
        
  // ===== Calculate Payment for this Pay Period =====
  function calculatePayment() {
    const total = submissions * perSubmissionRate + mileage * perMileRate;
    setTotalPayment(total);
  }

  // ===== Log Payment & Reset Data =====
  function logPayment() {
    if (!totalPayment || totalPayment <= 0) {
      alert("Payment total is $0. Cannot log a $0 payment.");
      return;
    }
  
    // Check if submissions > assignments and prompt confirmation if so
    if (submissions > assignmentsCount) {
      if (
        !window.confirm(
          `Warning: The number of submissions (${submissions}) exceeds the number of assignments (${assignmentsCount}). Are you sure you want to proceed?`
        )
      ) {
        return;
      }
    }
  
    fetch("https://cp-check-submissions-dev-backend.onrender.com/admin/process-payment", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        userId: selectedUser,
        submissions,
        mileage,
        perSubmissionRate,
        perMileRate,
        totalPayment,
      }),
    })
      .then(() => {
        alert("Payment logged!");
  
        // Mark user as "Paid" locally
        setUsers((prevUsers) =>
          prevUsers.map((user) =>
            user._id === selectedUser ? { ...user, status: "PAID" } : user
          )
        );
  
        // Clear local states
        setSubmissions(0);
        setMileage(0);
        setTotalPayment(null);
  
        // Refetch to update any YTD logic
        fetchUserData(selectedUser);
      })
      .catch((err) => console.error("Error logging payment:", err));
  }
  

  return (
    <div className="payments-container">
      <h1 className="payments-header">Payments 💰</h1>

      <button className="back-button" onClick={() => navigate("/dashboard")}>
        ← Back to Dashboard
      </button>

      <h2 className="payments-subheader">Week: {currentWeek}</h2>

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
            {users.map((user) => {
              // user.ytd -> total dollars from Payment aggregator
              return (
                <tr
                  key={user._id}
                  onClick={() => fetchUserData(user._id)}
                  className="clickable-row"
                >
                  <td>{user.username}</td>
                  <td
                    className={
                      user.status === "PAID" ? "status-paid" : "status-awaiting"
                    }
                  >
                    {user.status}
                  </td>
                  {/* YTD Miles: only show for selected user */}
                  <td>
                    {user._id === selectedUser ? ytdMiles.toFixed(2) : "—"}
                  </td>
                  {/* YTD $: only show for selected user */}
                  <td>
                    {user._id === selectedUser
                      ? `$${(user.ytd || 0).toFixed(2)}`
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedUser && (
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
            <h2 className="total-payment">
              Total Payment: ${totalPayment.toFixed(2)}
            </h2>
          )}

          <button
            onClick={logPayment}
            className="payments-button payments-success"
            disabled={!totalPayment || totalPayment <= 0}
          >
            Log Payment
          </button>
        </div>
      )}
    </div>
  );
}

export default Payments;
