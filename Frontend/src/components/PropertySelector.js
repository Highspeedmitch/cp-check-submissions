import React from 'react';
import { useNavigate } from 'react-router-dom';

function PropertySelector() {
    const navigate = useNavigate();

    return (
        <div className="container">
            <h1>Select a Property</h1>
            <div className="property-grid">
                {["San Clemente", "Broadway Center", "22 & Harrison"].map(property => (
                    <button key={property} className="property-box" onClick={() => navigate(`/form/${property}`)}>
                        {property}
                    </button>
                ))}
            </div>
        </div>
    );
}

export default PropertySelector;
