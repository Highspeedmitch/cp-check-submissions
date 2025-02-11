import React, { useState, useEffect } from "react";

function Payments() {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [submissions, setSubmissions] = useState(0);
  const [mileage, setMileage] = useState(0);
  const [perSubmissionRate, setPerSubmissionRate] = useState(25);
  const [perMileRate, setPerMileRate] = useState(0.5);
  const [totalPayment, setTotalPayment] = useState(null);
  const [currentWeek, setCurrentWeek] = useState("");

  const token = localStorage.getItem("token");

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

  // ===== Fetch Users =====
  useEffect(() => {
    fetch("https://cp-check-submissions-dev-backend.onrender.com/admin/users", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => {
        // Compute payment status based on lastPaidDate and start of week
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

  // ===== Fetch Selected User Data =====
  function fetchUserData(userId) {
    setSelectedUser(userId);

    // Fetch submissions since last payment
    fetch(`https://cp-check-submissions-dev-backend.onrender.com/api/admin/user-submissions/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setSubmissions(data.count))
      .catch((err) => console.error("Error fetching submissions:", err));

    // Fetch miles since last payment
    fetch(`https://cp-check-submissions-dev-backend.onrender.com/api/mileage/user/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setMileage(data.totalMiles))
      .catch((err) => console.error("Error fetching mileage:", err));
  }

  // ===== Calculate Payment =====
  function calculatePayment() {
    const total = submissions * perSubmissionRate + mileage * perMileRate;
    setTotalPayment(total);
  }

  // ===== Log Payment & Reset Data =====
  function logPayment() {
    fetch("https://cp-check-submissions-dev-backend.onrender.com/api/admin/process-payment", {
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
        setUsers((prevUsers) =>
          prevUsers.map((user) =>
            user._id === selectedUser ? { ...user, status: "PAID" } : user
          )
        );
        setSubmissions(0);
        setMileage(0);
        setTotalPayment(null);
      })
      .catch((err) => console.error("Error logging payment:", err));
  }

  return (
    <div className="payments-container">
      <h1 className="payments-header">Payments 💰</h1>
      <h2 className="payments-subheader">Week: {currentWeek}</h2>

      <div className="table-wrapper">
        <table className="payments-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Status</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedUser && (
        <div className="payment-card">
          <h3 className="card-title">Payment Details</h3>
          <p>
            <strong>Submissions:</strong> {submissions}
          </p>
          <p>
            <strong>Miles Driven:</strong> {mileage}
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

          <button onClick={logPayment} className="payments-button payments-success">
            Log Payment
          </button>
        </div>
      )}
    </div>
  );
}

export default Payments;
