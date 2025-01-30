import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

function Dashboard() {
    const navigate = useNavigate();
    const [properties, setProperties] = useState([]);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);
    const token = localStorage.getItem('token'); // Retrieve token for authentication

    useEffect(() => {
        if (!token) {
            navigate('/login'); // Redirect to login if no token
            return;
        }

        fetch('https://cp-check-submissions-dev.onrender.com/api/properties', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${token}` },
        })
        .then(res => res.json())
        .then(data => {
            if (data.error) {
                setError(data.error);
            } else {
                setProperties(data);
            }
            setLoading(false);
        })
        .catch(err => {
            console.error("Error fetching properties:", err);
            setError("Failed to load properties");
            setLoading(false);
        });
    }, [navigate, token]);

    const handleLogout = () => {
        localStorage.removeItem('token');
        navigate('/login');
    };

    return (
        <div className="dashboard-container">
            <h1>Dashboard</h1>

            <button className="logout-btn" onClick={handleLogout}>Logout</button>

            {loading ? <p>Loading properties...</p> : null}
            {error ? <p className="error">{error}</p> : null}

            <div className="property-list">
                {properties.length > 0 ? (
                    properties.map((property, index) => (
                        <div key={index} className="property-card" onClick={() => navigate(`/form/${property}`)}>
                            <h3>{property}</h3>
                            <p>Click to complete checklist</p>
                        </div>
                    ))
                ) : (
                    <p>No properties found for your organization.</p>
                )}
            </div>
        </div>
    );
}

export default Dashboard;
