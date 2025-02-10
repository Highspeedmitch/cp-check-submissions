const mileageSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true },
    month: { type: String, required: true }, // "YYYY-MM"
    totalMiles: { type: Number, default: 0 },
    locations: [{ lat: Number, lng: Number, timestamp: Date }]
  });
  