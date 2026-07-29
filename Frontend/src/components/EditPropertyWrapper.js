// EditPropertyWrapper.js
import React from "react";
import STReditProperty from "./STReditProperty";  // your existing form
import AZRaccessinstructions from "./AZRaccessinstructions"; // your new AzRoots form

function EditPropertyWrapper() {
  const role = localStorage.getItem("role");
  const orgName = localStorage.getItem("orgName");
  const isAzRootsAdmin = (role === "admin" && orgName === "AzRoots");

  if (isAzRootsAdmin) {
    // If AzRoots => show advanced instructions
    return <AZRaccessinstructions />;
  } else {
    // Other organizations use the standard short-term-rental editor.
    return <STReditProperty />;
  }
}

export default EditPropertyWrapper;
