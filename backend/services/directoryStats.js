function recordsById(records = []) {
  return new Map(records.map((record) => [String(record._id), record]));
}

function deploymentSummariesByResource(deployments = []) {
  const summaries = new Map();
  deployments.forEach((deployment) => {
    const resourceId = String(deployment.resourceProfileId);
    const current = summaries.get(resourceId) || {
      deploymentCount: 0,
      deployedOrganizations: new Set(),
    };
    current.deploymentCount += 1;
    if (deployment.organizationId?.name) {
      current.deployedOrganizations.add(deployment.organizationId.name);
    }
    summaries.set(resourceId, current);
  });
  return new Map([...summaries].map(([resourceId, summary]) => [resourceId, {
    deploymentCount: summary.deploymentCount,
    deployedOrganizations: [...summary.deployedOrganizations],
  }]));
}

module.exports = { recordsById, deploymentSummariesByResource };
