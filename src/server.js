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

// Route for the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('Server is healthy');
});

// Enhanced address lookup endpoint
app.post('/get-address', async (req, res) => {
  const { lat, lng } = req.body;
  
  if (!lat || !lng) {
    return res.status(400).json({ error: 'Latitude and longitude are required' });
  }

  try {
    // Try multiple geocoding services for better accuracy
    let addressData = null;
    
    // Try Nominatim with Hebrew preference
    try {
      const nominatimResponse = await axios.get(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=he,en&addressdetails=1&zoom=18`,
        { 
          headers: { 
            'User-Agent': 'CoordinateConverter/1.0' 
          },
          timeout: 8000 
        }
      );
      
      const data = nominatimResponse.data;
      if (data && data.address) {
        addressData = {
          street: data.address.road || data.address.pedestrian || '',
          number: data.address.house_number || '',
          city: data.address.city || data.address.town || data.address.village || data.address.municipality || '',
          zip: data.address.postcode || '',
          fullAddress: data.display_name || ''
        };
      }
    } catch (error) {
      console.log('Nominatim failed, using coordinate-based detection');
    }

    // Fallback using coordinate-based city detection
    if (!addressData || !addressData.city) {
      const city = getCityFromCoordinates(lat, lng);
      addressData = addressData || {};
      addressData.city = addressData.city || city;
      addressData.street = addressData.street || '';
      addressData.number = addressData.number || '';
      addressData.zip = addressData.zip || '';
      addressData.fullAddress = addressData.fullAddress || `${addressData.street} ${addressData.number}, ${city}`.trim();
    }

    return res.json(addressData);
    
  } catch (error) {
    console.error('Error getting address:', error);
    return res.status(500).json({
      error: 'Failed to get address',
      details: error.message
    });
  }
});

// Helper function to detect city from coordinates
function getCityFromCoordinates(lat, lng) {
  // Basic coordinate-based city detection for Israel
  const cities = [
    { name: 'תל אביב-יפו', lat: 32.0853, lng: 34.7818, radius: 0.1 },
    { name: 'חיפה', lat: 32.7940, lng: 34.9896, radius: 0.15 },
    { name: 'ירושלים', lat: 31.7683, lng: 35.2137, radius: 0.2 },
    { name: 'ראשון לציון', lat: 31.9730, lng: 34.8066, radius: 0.08 },
    { name: 'פתח תקווה', lat: 32.0878, lng: 34.8878, radius: 0.08 },
    { name: 'נתניה', lat: 32.3215, lng: 34.8532, radius: 0.1 },
    { name: 'באר שבע', lat: 31.2518, lng: 34.7915, radius: 0.15 },
    { name: 'חולון', lat: 32.0117, lng: 34.7750, radius: 0.06 },
    { name: 'בני ברק', lat: 32.0809, lng: 34.8338, radius: 0.05 },
    { name: 'רמת גן', lat: 32.0719, lng: 34.8242, radius: 0.05 },
    { name: 'אשדוד', lat: 31.8044, lng: 34.6553, radius: 0.1 },
    { name: 'אשקלון', lat: 31.6688, lng: 34.5742, radius: 0.08 }
  ];
  
  for (const city of cities) {
    const distance = Math.sqrt(
      Math.pow(lat - city.lat, 2) + Math.pow(lng - city.lng, 2)
    );
    if (distance <= city.radius) {
      return city.name;
    }
  }
  
  return 'לא זוהה';
}

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
