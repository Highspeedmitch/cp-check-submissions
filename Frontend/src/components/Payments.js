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

  // 🚀 Function to get the current week's range (Sunday - Saturday)
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

  // 🚀 Fetch all users & their payment status
  useEffect(() => {
    fetch("https://cp-check-submissions-dev-backend.onrender.com/admin/users", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setUsers(data))
      .catch((err) => console.error("Error fetching users:", err));
  }, []);

  // 🚀 Fetch selected user's data
  function fetchUserData(userId) {
    setSelectedUser(userId);

    // ✅ Fetch submissions since last payment
    fetch(`https://cp-check-submissions-dev-backend.onrender.com/admin/user-submissions/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setSubmissions(data.count));

    // ✅ Fetch miles since last payment
    fetch(`https://cp-check-submissions-dev-backend.onrender.com/mileage/user/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => res.json())
      .then((data) => setMileage(data.totalMiles));
  }

  // ✅ Calculate Payment
  function calculatePayment() {
    const total = submissions * perSubmissionRate + mileage * perMileRate;
    setTotalPayment(total);
  }

  // ✅ Log Payment & Reset Data
  function logPayment() {
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
    }).then(() => {
      alert("Payment logged!");
      setUsers((prevUsers) =>
        prevUsers.map((user) =>
          user._id === selectedUser ? { ...user, status: "PAID" } : user
        )
      );
      setSubmissions(0);
      setMileage(0);
      setTotalPayment(null);
    });
  }

  return (
    <div>
      <h1>Payments 💰</h1>
      <h2>Week: {currentWeek}</h2>

      <table>
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
              style={{ cursor: "pointer" }}
            >
              <td>{user.username}</td>
              <td
                style={{
                  color: user.status === "PAID" ? "green" : "blue",
                  fontWeight: "bold",
                }}
              >
                {user.status}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {selectedUser && (
        <>
          <h3>Submissions: {submissions}</h3>
          <h3>Miles Driven: {mileage}</h3>

          <label>Per Submission Rate ($):</label>
          <input
            type="number"
            value={perSubmissionRate}
            onChange={(e) => setPerSubmissionRate(Number(e.target.value))}
          />

          <label>Per Mile Rate ($):</label>
          <input
            type="number"
            value={perMileRate}
            onChange={(e) => setPerMileRate(Number(e.target.value))}
          />

          <button onClick={calculatePayment}>Calculate Payment</button>

          {totalPayment !== null && (
            <h2>Total Payment: ${totalPayment.toFixed(2)}</h2>
          )}

          <button onClick={logPayment}>Log Payment</button>
        </>
      )}
    </div>
  );
}

export default Payments;
