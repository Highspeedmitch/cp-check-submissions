import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import PageHeader from "./ui/PageHeader";
import ContextualHelpLink from "./help/ContextualHelpLink";
import { api } from "../services/api";
import AdminInvitationDialog from "./admin/AdminInvitationDialog";
import AdministratorAccessDialog from "./admin/AdministratorAccessDialog";
import LicenseIncreaseRequestDialog from "./admin/LicenseIncreaseRequestDialog";
import ConfirmationDialog from "./ui/ConfirmationDialog";
import {
  CUSTOMER_ENGAGEMENT_OPTIONS,
  ORGANIZATION_ROLE_OPTIONS,
  customerEngagementLabel,
  inferredCustomerEngagementType,
  normalizeOrganizationUserForEditing,
  organizationRoleLabel,
  roleRequiresCustomerEngagement,
} from "../services/organizationUsers";

const EMPTY_INVITATION = {
  email: "",
  role: "user",
  engagementType: "customer_employee",
  propertyIds: [],
};

export default function UserManagement() {
  const navigate = useNavigate();
  const [data, setData] = useState({
    users: [],
    properties: [],
    invitations: [],
    administrators: [],
    adminInvitations: [],
    adminSeats: null,
    capacity: null,
    license: null,
    licenseOptions: null,
  });
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState(null);
  const [propertyIds, setPropertyIds] = useState([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyAction, setBusyAction] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteDraft, setInviteDraft] = useState(EMPTY_INVITATION);
  const [directory, setDirectory] = useState("current");
  const [userSearch, setUserSearch] = useState("");
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [adminInviteOpen, setAdminInviteOpen] = useState(false);
  const [adminAccessTarget, setAdminAccessTarget] = useState(null);
  const [licenseRequestOpen, setLicenseRequestOpen] = useState(false);
  const [revokeInvitationTarget, setRevokeInvitationTarget] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setData(await api.get(`/api/admin-users?directory=${directory}`));
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [directory]);
  useEffect(() => { load(); }, [load]);

  const visibleUsers = data.users.filter((user) => {
    const search = userSearch.trim().toLowerCase();
    if (!search) return true;
    return [
      user.username,
      user.email,
      user.role,
      organizationRoleLabel(user.role),
      customerEngagementLabel(inferredCustomerEngagementType(user)),
    ]
      .some((value) => String(value || "").toLowerCase().includes(search));
  });

  function changeDirectory(nextDirectory) {
    setDirectory(nextDirectory);
    setSelectedId("");
    setDraft(null);
    setPropertyIds([]);
    setArchiveOpen(false);
    setArchiveReason("");
    setUserSearch("");
    setMessage("");
    setError("");
  }

  function chooseUser(userId) {
    const user = data.users.find((item) => item._id === userId);
    setSelectedId(userId);
    setDraft(user ? {
      ...normalizeOrganizationUserForEditing(user),
      accountStatus: user.accountStatus || "active",
    } : null);
    const assignmentField = user?.role === "client" ? "clientOwners" : "propertyManagers";
    setPropertyIds(user ? data.properties
      .filter((property) => (property[assignmentField] || []).some((id) => id === userId))
      .map((property) => property._id) : []);
    setMessage("");
    setError("");
    setArchiveOpen(false);
    setArchiveReason("");
  }

  async function archiveUser() {
    if (!draft || busyAction || archiveReason.trim().length < 3) return;
    if (!window.confirm(`Archive ${draft.username || draft.email}? They will be removed from the current user directory.`)) return;
    setBusyAction("archive");
    setMessage("");
    setError("");
    try {
      const result = await api.post(`/api/admin-users/${selectedId}/archive`, { reason: archiveReason.trim() });
      setMessage(result.message || "User archived.");
      setSelectedId("");
      setDraft(null);
      setArchiveOpen(false);
      setArchiveReason("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction("");
    }
  }

  async function restoreUser() {
    if (!draft || busyAction || !window.confirm(`Restore ${draft.username || draft.email} to the current user directory?`)) return;
    setBusyAction("restore");
    setMessage("");
    setError("");
    try {
      const result = await api.post(`/api/admin-users/${selectedId}/restore`, {});
      setMessage(result.message || "User restored.");
      setSelectedId("");
      setDraft(null);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction("");
    }
  }

  async function save() {
    if (!draft || busyAction) return;
    setBusyAction("save");
    setMessage("");
    setError("");
    try {
      await api.put(`/api/admin-users/${selectedId}`, { ...draft, propertyIds });
      setMessage("User updated. Their existing sessions have been invalidated.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction("");
    }
  }

  async function sendReset() {
    if (busyAction) return;
    setBusyAction("reset");
    setMessage("");
    setError("");
    try {
      const body = await api.post(`/api/admin-users/${selectedId}/send-password-reset`);
      setMessage(body.message || "Password reset sent.");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction("");
    }
  }

  function toggleProperty(propertyId, checked) {
    setPropertyIds(checked
      ? [...propertyIds, propertyId]
      : propertyIds.filter((id) => id !== propertyId));
  }

  function toggleInvitationProperty(propertyId, checked) {
    setInviteDraft((current) => ({
      ...current,
      propertyIds: checked
        ? [...current.propertyIds, propertyId]
        : current.propertyIds.filter((id) => id !== propertyId),
    }));
  }

  async function sendInvitation(event) {
    event.preventDefault();
    if (busyAction) return;
    setBusyAction("invite");
    setMessage("");
    setError("");
    try {
      const result = await api.post("/api/admin-users/invitations", inviteDraft);
      setMessage(result.message || "Invitation sent.");
      setInviteDraft(EMPTY_INVITATION);
      setInviteOpen(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction("");
    }
  }

  async function resendInvitation(invitationId) {
    if (busyAction) return;
    setBusyAction(`resend-${invitationId}`);
    setMessage("");
    setError("");
    try {
      const result = await api.post(`/api/admin-users/invitations/${invitationId}/resend`);
      setMessage(result.message || "Invitation resent.");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyAction("");
    }
  }

  async function revokeInvitation(invitationId) {
    if (busyAction) return;
    setBusyAction(`revoke-${invitationId}`);
    setMessage("");
    setError("");
    try {
      await api.delete(`/api/admin-users/invitations/${invitationId}`);
      setMessage("Invitation revoked.");
      await load();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setBusyAction("");
    }
  }

  async function inviteAdministrators({ emails, passkey }) {
    if (busyAction) return;
    setBusyAction("invite-admin");
    setMessage("");
    setError("");
    try {
      const verification = await api.post("/api/organization-security/grants", {
        purpose: "invite_admin",
        passkey,
      });
      const result = await api.post("/api/admin-users/admin-invitations", {
        emails,
        adminActionGrant: verification.grant,
      });
      setMessage(result.message || "Administrator invitation sent.");
      setAdminInviteOpen(false);
      await load();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setBusyAction("");
    }
  }

  async function changeAdministratorAccess(administrator, {
    disposition,
    targetRole,
    engagementType,
    propertyIds: resultingPropertyIds,
    reason,
    currentPassword,
    code,
    passkey,
  }) {
    if (busyAction) return;
    setBusyAction(`admin-access-${administrator._id}`);
    setMessage("");
    setError("");
    try {
      const verification = await api.post("/api/organization-security/grants", {
        purpose: "remove_admin",
        currentPassword,
        code,
        passkey,
      });
      const result = await api.post(`/api/admin-users/administrators/${administrator._id}/access`, {
        disposition,
        targetRole,
        engagementType,
        propertyIds: resultingPropertyIds,
        reason,
        adminActionGrant: verification.grant,
      });
      setMessage(result.message || "Administrator access changed.");
      setAdminAccessTarget(null);
      await load();
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setBusyAction("");
    }
  }

  async function requestAdditionalAdminLicense(payload) {
    if (busyAction) return;
    setBusyAction("request-admin-license");
    setMessage("");
    setError("");
    try {
      const result = await api.post("/api/service-model-changes", payload);
      setMessage(result.emailDelivered === false
        ? "License increase requested. It is available for platform review, but the notification email could not be delivered."
        : "License increase requested. Afterlight platform administration was notified.");
      setLicenseRequestOpen(false);
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setBusyAction("");
    }
  }

  return (
    <div className="beta-page">
    <main className="beta-page-shell">
      <PageHeader
        onBack={() => navigate("/dashboard")}
        eyebrow="Organization administration"
        title="User Management"
        subtitle="Manage roles, account access, and property assignments"
        actions={<ContextualHelpLink slug="manage-organization-users" />}
      />
      {message && <p className="beta-alert success" role="status">{message}</p>}
      {error && <p className="beta-alert error" role="alert">{error}</p>}

      {directory === "current" && data.adminSeats && (
        <section className="beta-panel beta-admin-seat-panel" aria-labelledby="administrator-seats-title">
          <div className="beta-section-heading">
            <div>
              <p className="beta-eyebrow">{data.adminSeats.planLabel}</p>
              <h2 id="administrator-seats-title">Administrator seats</h2>
              <p>{data.adminSeats.active} active administrator{data.adminSeats.active === 1 ? "" : "s"} · {data.adminSeats.pending} invitation{data.adminSeats.pending === 1 ? "" : "s"} pending</p>
            </div>
            {(data.adminSeats.unmetered || data.adminSeats.remaining > 0) ? (
              <button className="beta-button compact" type="button" onClick={() => setAdminInviteOpen(true)}>
                Invite Administrator
              </button>
            ) : (
              <button className="beta-button secondary compact" type="button"
                disabled={Boolean(busyAction)} onClick={() => setLicenseRequestOpen(true)}>
                Request Additional License
              </button>
            )}
          </div>
          {data.adminSeats.unmetered ? (
            <p className="beta-admin-seat-unmetered">Administrator seats are not metered under this managed-service agreement.</p>
          ) : (
            <div className="beta-admin-seat-meter">
              <div><strong>{data.adminSeats.allocated}/{data.adminSeats.limit}</strong><span>administrator seats allocated</span></div>
              <progress max={data.adminSeats.limit} value={Math.min(data.adminSeats.allocated, data.adminSeats.limit)}
                aria-label={`${data.adminSeats.allocated} of ${data.adminSeats.limit} administrator seats allocated`} />
              {data.adminSeats.overLimit && <small className="beta-text-danger">This organization is over its licensed administrator limit.</small>}
            </div>
          )}
          {(data.administrators.length > 0 || data.adminInvitations.length > 0) && (
            <div className="beta-admin-seat-directory">
              {data.administrators.map((administrator) => {
                const isCurrentAdministrator = String(administrator._id) === String(localStorage.getItem("userId"));
                const isLastActiveAdministrator = administrator.accountStatus !== "inactive"
                  && Number(data.adminSeats.active || 0) <= 1;
                const platformProtected = administrator.platformRole === "platform_admin";
                return (
                  <div key={administrator._id} className="beta-admin-seat-person">
                    <div><strong>{administrator.username || administrator.email}</strong><small>{administrator.email}</small></div>
                    <div className="beta-card-actions">
                      <span className={`beta-status ${administrator.accountStatus === "inactive" ? "declined" : "success"}`}>{administrator.accountStatus || "active"}</span>
                      {isCurrentAdministrator ? (
                        <small>Current administrator</small>
                      ) : platformProtected ? (
                        <small>Platform-protected</small>
                      ) : (
                        <button className="beta-button danger compact" type="button"
                          aria-label={`Manage access for ${administrator.email}`}
                          title={isLastActiveAdministrator ? "Invite and verify another administrator first." : undefined}
                          disabled={Boolean(busyAction) || isLastActiveAdministrator}
                          onClick={() => setAdminAccessTarget(administrator)}>
                          Manage access
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
              {data.adminInvitations.map((invitation) => (
                <div key={invitation._id} className="beta-admin-seat-person">
                  <div><strong>{invitation.email}</strong><small>Administrator invitation · {invitation.status}</small></div>
                  <div className="beta-card-actions">
                    {invitation.status === "pending" && (
                      <button className="beta-button secondary compact" type="button" disabled={Boolean(busyAction)}
                        onClick={() => resendInvitation(invitation._id)}>
                        {busyAction === `resend-${invitation._id}` ? "Sending…" : "Resend"}
                      </button>
                    )}
                    <button className="beta-button danger compact" type="button" disabled={Boolean(busyAction)}
                      onClick={() => setRevokeInvitationTarget(invitation)}>
                      {busyAction === `revoke-${invitation._id}` ? "Revoking…" : "Revoke"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {directory === "current" && <section className="beta-panel beta-invitation-panel">
        <div className="beta-section-heading">
          <div>
            <h2>Invitations</h2>
            <p>Invite users with their organization and role already assigned.</p>
            {data.capacity?.users && (
              <small>
                {data.capacity.users.unmetered
                  ? "User seats are not metered for this organization."
                  : `${data.capacity.users.allocated}/${data.capacity.users.limit} user seats allocated`}
              </small>
            )}
          </div>
          <div className="beta-card-actions">
            <button className="beta-button secondary compact" type="button"
              onClick={() => navigate("/admin/bulk-onboarding?type=users")}>Import Users</button>
            <button className="beta-button compact" type="button"
              disabled={data.capacity?.users?.remaining === 0}
              onClick={() => setInviteOpen((open) => !open)}>
              {inviteOpen ? "Close" : "Invite User"}
            </button>
          </div>
        </div>
        {data.capacity?.users?.remaining === 0 && (
          <p className="beta-alert notice">
            All licensed user seats are allocated. Revoke an unused invitation, archive an inactive user,
            or request a higher tier from Service Delivery.
          </p>
        )}
        {inviteOpen && (
          <form className="beta-invitation-form" onSubmit={sendInvitation}>
            <div className="beta-form-grid">
              <label className="beta-form-field">Email address
                <input type="email" autoComplete="email" value={inviteDraft.email}
                  onChange={(event) => setInviteDraft({ ...inviteDraft, email: event.target.value })} required />
              </label>
              <label className="beta-form-field">Role
                <select value={inviteDraft.role} onChange={(event) => {
                  const role = event.target.value;
                  setInviteDraft({
                    ...inviteDraft,
                    role,
                    engagementType: role === "user" ? "customer_employee" : "",
                    propertyIds: [],
                  });
                }}>
                  {ORGANIZATION_ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="beta-form-field">Assignment type
                <select
                  value={inviteDraft.engagementType || ""}
                  onChange={(event) => setInviteDraft({ ...inviteDraft, engagementType: event.target.value })}
                  required={roleRequiresCustomerEngagement(inviteDraft.role)}
                >
                  <option value="">Not scheduled</option>
                  {CUSTOMER_ENGAGEMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <small>Customer employees do not create invoices. Customer contractors route to customer accounts payable.</small>
              </label>
            </div>
            {["property_manager", "client"].includes(inviteDraft.role) && (
              <fieldset className="beta-property-access">
                <legend>{inviteDraft.role === "client" ? "Owned properties" : "Managed properties"}</legend>
                {data.properties.length ? data.properties.map((property) => (
                  <label key={property._id}>
                    <input type="checkbox" checked={inviteDraft.propertyIds.includes(property._id)}
                      onChange={(event) => toggleInvitationProperty(property._id, event.target.checked)} />
                    {property.name}
                  </label>
                )) : <small>No properties have been configured yet.</small>}
              </fieldset>
            )}
            <button className="beta-button" type="submit" disabled={Boolean(busyAction)}>
              {busyAction === "invite" ? "Sending..." : "Send Invitation"}
            </button>
          </form>
        )}
        {data.invitations.length > 0 && (
          <div className="beta-pending-invitations">
            {data.invitations.map((invitation) => (
              <article key={invitation._id} className="beta-invitation-row">
                <div><strong>{invitation.email}</strong><small>{organizationRoleLabel(invitation.role)} · {customerEngagementLabel(inferredCustomerEngagementType(invitation))} · {invitation.status}</small></div>
                <div className="beta-card-actions">
                  {invitation.status === "pending" && (
                    <button className="beta-button secondary compact" type="button" disabled={Boolean(busyAction)} onClick={() => resendInvitation(invitation._id)}>
                      {busyAction === `resend-${invitation._id}` ? "Sending..." : "Resend"}
                    </button>
                  )}
                  <button className="beta-button danger compact" type="button" disabled={Boolean(busyAction)} onClick={() => setRevokeInvitationTarget(invitation)}>
                    {busyAction === `revoke-${invitation._id}` ? "Revoking..." : "Revoke"}
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>}

      <div className="beta-user-layout">
        <section className="beta-panel beta-user-list">
          <div className="beta-section-heading">
            <div>
              <h2>{directory === "archived" ? "Archived Users" : "Current Users"}</h2>
              <p>{directory === "archived" ? "Search retained user records and restore access when appropriate." : "Select a user to review their role and access."}</p>
            </div>
          </div>
          <div className="beta-card-actions">
            <button type="button" className={`beta-button compact${directory === "current" ? "" : " secondary"}`} onClick={() => changeDirectory("current")}>Current users</button>
            <button type="button" className={`beta-button compact${directory === "archived" ? "" : " secondary"}`} onClick={() => changeDirectory("archived")}>Find archived user</button>
          </div>
          <label className="beta-form-field">Search {directory === "archived" ? "archived" : "current"} users
            <input type="search" value={userSearch} placeholder="Name, email, or role" onChange={(event) => setUserSearch(event.target.value)} />
          </label>
          {loading && <div className="beta-empty-state">Loading users…</div>}
          {error && !data.users.length && <p className="beta-alert error">{error}</p>}
          {!loading && !visibleUsers.length && <div className="beta-empty-state">No {directory} users match this search.</div>}
          {visibleUsers.map((user) => (
            <button key={user._id} onClick={() => chooseUser(user._id)}
              className={`beta-user-row${selectedId === user._id ? " active" : ""}`}>
              <span>{user.username || user.email}</span>
              <small>{organizationRoleLabel(user.role)} · {customerEngagementLabel(inferredCustomerEngagementType(user))} · {directory === "archived" ? "archived" : user.accountStatus || "active"}</small>
            </button>
          ))}
        </section>

        <section className="beta-panel beta-user-editor">
          {!draft ? <div className="beta-empty-state">Select a user to review or edit.</div> : (
            directory === "archived" ? <>
              <div className="beta-section-heading">
                <div><h2>{draft.username || draft.email}</h2><p>Archived organization user</p></div>
                <span className="beta-status declined">Archived</span>
              </div>
              <dl className="platform-resource-facts">
                <div><dt>Email</dt><dd>{draft.email}</dd></div>
                <div><dt>Former role</dt><dd>{organizationRoleLabel(draft.role)}</dd></div>
                <div><dt>Former assignment type</dt><dd>{customerEngagementLabel(draft.engagementType)}</dd></div>
                <div><dt>Archived</dt><dd>{draft.organizationArchivedAt ? new Date(draft.organizationArchivedAt).toLocaleString() : "Unknown"}</dd></div>
                <div><dt>Submissions</dt><dd>{draft.submissionCount || 0}</dd></div>
                <div><dt>Assignments</dt><dd>{draft.assignmentCount || 0}</dd></div>
              </dl>
              <div className="beta-policy-notice"><strong>Archive reason</strong><p>{draft.organizationArchiveReason || "No reason recorded."}</p></div>
              <p>Restoring returns this record to Current Users. Its previous active or inactive account status is preserved, and property access must be reassigned manually.</p>
              <button type="button" className="beta-button" disabled={Boolean(busyAction)} onClick={restoreUser}>
                {busyAction === "restore" ? "Restoring…" : "Restore User"}
              </button>
            </> : <>
              <div className="beta-section-heading"><div><h2>{draft.username || draft.email}</h2><p>Edit account details and access.</p></div>
                <span className={`beta-status ${draft.accountStatus === "active" ? "success" : "declined"}`}>{draft.accountStatus || "active"}</span>
              </div>
              <div className="beta-form-grid">
              <label className="beta-form-field">Name
                <input value={draft.username || ""} onChange={(e) => setDraft({ ...draft, username: e.target.value })} />
              </label>
              <label className="beta-form-field">Email
                <input type="email" value={draft.email || ""} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
              </label>
              <label className="beta-form-field">Role
                <select value={draft.role} onChange={(e) => {
                  const role = e.target.value;
                  setPropertyIds([]);
                  setDraft({
                    ...draft,
                    role,
                    engagementType: role === "user" ? (draft.engagementType || "customer_employee") : "",
                  });
                }}>
                  {ORGANIZATION_ROLE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="beta-form-field">Assignment type
                <select
                  value={draft.engagementType || ""}
                  onChange={(e) => setDraft({ ...draft, engagementType: e.target.value })}
                  required={roleRequiresCustomerEngagement(draft.role)}
                >
                  <option value="">Not scheduled</option>
                  {CUSTOMER_ENGAGEMENT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <small>Only a matching assignment type appears for Customer Employee or Customer Contractor fulfillment.</small>
              </label>
              <label className="beta-form-field">Status
                <select value={draft.accountStatus || "active"} onChange={(e) => setDraft({ ...draft, accountStatus: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </label>
              {draft.engagementType === "customer_contractor" && (
                <label className="beta-form-field full">Invoice issuer / company name
                  <input
                    maxLength="160"
                    value={draft.billingProfile?.companyName || ""}
                    placeholder={draft.username || "Contractor name"}
                    onChange={(e) => setDraft({
                      ...draft,
                      billingProfile: {
                        ...(draft.billingProfile || {}),
                        companyName: e.target.value,
                      },
                    })}
                  />
                  <small>Used as the “From” name on this contractor’s invoices. Their account name is used when blank.</small>
                </label>
              )}
              </div>

              {["property_manager", "client"].includes(draft.role) && (
                <fieldset className="beta-property-access">
                  <legend>{draft.role === "client" ? "Owned Properties" : "Managed Properties"}</legend>
                  {data.properties.map((property) => (
                    <label key={property._id}>
                      <input type="checkbox" checked={propertyIds.includes(property._id)}
                        onChange={(e) => toggleProperty(property._id, e.target.checked)} />
                      {property.name}
                    </label>
                  ))}
                </fieldset>
              )}

              <div className="beta-card-actions">
                <button className="beta-button" disabled={Boolean(busyAction) || (roleRequiresCustomerEngagement(draft.role) && !draft.engagementType)} onClick={save}>
                  {busyAction === "save" ? "Saving…" : "Save Changes"}
                </button>
                <button className="beta-button secondary" disabled={Boolean(busyAction)} onClick={sendReset}>
                  {busyAction === "reset" ? "Sending…" : "Send Password Reset"}
                </button>
                <button className="beta-button danger" disabled={Boolean(busyAction)} onClick={() => setArchiveOpen((open) => !open)}>
                  {archiveOpen ? "Cancel Archive" : "Archive User"}
                </button>
              </div>
              {archiveOpen && <div className="beta-policy-notice">
                <strong>Archive this user</strong>
                <p>They will lose organization access and disappear from Current Users. Historical submissions and assignments remain available.</p>
                <label className="beta-form-field">Archive reason
                  <textarea maxLength="500" value={archiveReason} onChange={(event) => setArchiveReason(event.target.value)} placeholder="Why is this user leaving the active directory?" />
                </label>
                <button type="button" className="beta-button danger" disabled={Boolean(busyAction) || archiveReason.trim().length < 3} onClick={archiveUser}>
                  {busyAction === "archive" ? "Archiving…" : "Confirm Archive"}
                </button>
              </div>}
            </>
          )}
        </section>
      </div>
    </main>
    {adminInviteOpen && data.adminSeats && (
      <AdminInvitationDialog adminSeats={data.adminSeats} onClose={() => setAdminInviteOpen(false)} onSubmit={inviteAdministrators} />
    )}
    {licenseRequestOpen && data.license && data.licenseOptions && (
      <LicenseIncreaseRequestDialog
        license={data.license}
        options={data.licenseOptions}
        onClose={() => setLicenseRequestOpen(false)}
        onSubmit={requestAdditionalAdminLicense}
      />
    )}
    {adminAccessTarget && data.adminSeats && (
      <AdministratorAccessDialog
        administrator={adminAccessTarget}
        adminSeats={data.adminSeats}
        properties={data.properties}
        onClose={() => setAdminAccessTarget(null)}
        onSubmit={(payload) => changeAdministratorAccess(adminAccessTarget, payload)}
      />
    )}
    {revokeInvitationTarget && (
      <ConfirmationDialog
        eyebrow="Invitation security"
        title="Revoke this invitation?"
        description={`The invitation for ${revokeInvitationTarget.email} will stop working immediately and its reserved seat will be released.`}
        confirmLabel="Revoke invitation"
        danger
        onClose={() => setRevokeInvitationTarget(null)}
        onConfirm={() => revokeInvitation(revokeInvitationTarget._id)}
      />
    )}
    </div>
  );
}
