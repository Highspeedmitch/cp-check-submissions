// EditPropertyWrapper.js
import React from "react";
import { useParams } from "react-router-dom";
import STReditProperty from "./STReditProperty";  // your existing form
import AZRaccessinstructions from "./AZRaccessinstructions"; // your new AzRoots form

function EditPropertyWrapper() {
  const role = localStorage.getItem("role");
  const orgName = localStorage.getItem("orgName");
  const isAzRootsAdmin = (role === "admin" && orgName === "AzRoots");

  const { propertyName } = useParams(); 
  console.log("EditPropertyWrapper for:", propertyName, "isAzRootsAdmin?", isAzRootsAdmin);

  if (isAzRootsAdmin) {
    // If AzRoots => show advanced instructions
    return <AZRaccessinstructions />;
  } else {
    // Otherwise => show the old STReditProperty
    return <STReditProperty />;
  }
}

export default EditPropertyWrapper;
