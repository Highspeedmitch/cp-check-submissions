// GET /api/assignments/count/:userId
// Returns the number of assignments for the user since lastPaidDate
router.get("/assignments/count/:userId", async (req, res) => {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ error: "User not found." });
      
      const sinceDate = user.lastPaidDate || new Date(0);
      // Count assignments with startDate >= lastPaidDate (or some other filter logic)
      const count = await Assignment.countDocuments({
        userId,
        startDate: { $gte: sinceDate },
      });
      
      res.json({ count });
    } catch (error) {
      console.error("Error fetching assignment count:", error);
      res.status(500).json({ error: "Server error fetching assignment count" });
    }
  });
  