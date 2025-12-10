export default function handler(req, res) {
  // No center points available in combined UI; return empty list to avoid 404/parse errors
  res.status(200).json([]);
}


