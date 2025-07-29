const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from public directory
app.use(express.static(path.join(__dirname, '../public')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('Server is healthy');
});

// Fiber check endpoint
app.post('/check-fiber', async (req, res) => {
  const { address } = req.body;
  
  if (!address) {
    return res.status(400).json({ error: 'Address is required' });
  }

  try {
    // Try Bezeq API first
    try {
      const bezeqResponse = await axios.post(
        'https://www.bezeq.co.il/internetandphone/internet/bfiber_addresscheck/checkAddress',
        { address },
        { 
          headers: { 
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
          } 
        }
      );
      
      return res.json({
        available: bezeqResponse.data.available,
        speed: bezeqResponse.data.speed || 'עד 1Gbps',
        message: bezeqResponse.data.message || 'בדיקה הושלמה',
        link: `https://www.bezeq.co.il/internetandphone/internet/bfiber_addresscheck/?address=${encodeURIComponent(address)}`
      });
    } catch (bezeqError) {
      console.log('Bezeq API failed, trying ZOL fallback');
    }

    // Fallback to ZOL
    const zolResponse = await axios.post(
      'https://www.zol-li.co.il/wp-admin/admin-ajax.php',
      `action=fiber_address_check&address=${encodeURIComponent(address)}`,
      { 
        headers: { 
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        } 
      }
    );
    
    const html = zolResponse.data;
    const available = html.includes('fiber-result-available');
    const speedMatch = html.match(/מהירות: ([^<]+)</);
    const speed = speedMatch ? speedMatch[1] : 'עד 1Gbps';
    
    return res.json({
      available,
      speed,
      message: available ? 'הכתובת זכאית לחיבור סיבים אופטיים' : 'הכתובת אינה זכאית לחיבור סיבים אופטיים כרגע',
      link: `https://www.zol-li.co.il/fiber-address-check-bezeq/?address=${encodeURIComponent(address)}`
    });
    
  } catch (error) {
    console.error('Error checking fiber:', error);
    return res.status(500).json({
      error: 'Failed to check fiber availability',
      details: error.message
    });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
