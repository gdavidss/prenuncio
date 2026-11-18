// The country a request comes from, as the host sees it, so the page can open in that country's language when the
// reader has not chosen one. Nothing is stored and nothing else is read. Vercel sets the header.
module.exports = (req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.status(200).send(JSON.stringify({ country: req.headers["x-vercel-ip-country"] || null }));
};
