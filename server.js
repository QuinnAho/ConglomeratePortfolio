const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Serve static assets
app.use(express.static(path.join(__dirname, 'public')));

/*
// Fallback for resume download
app.get('/resume', (req, res) => {
  const resumePath = path.join(__dirname, 'public', 'Quinn Aho Resume.pdf');
  res.download(resumePath, 'Quinn_Aho_Resume.pdf');
});
*/
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
