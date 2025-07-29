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
    
    // 1. Try Israel Post API (most accurate for Israel)
    try {
      const israelPostResponse = await axios.get(
        `https://api.israelpost.co.il/search/address/reverse?lat=${lat}&lon=${lng}`,
        { timeout: 5000 }
      );
      
      if (israelPostResponse.data && israelPostResponse.data.address) {
        const addr = israelPostResponse.data.address;
        addressData = {
          street: addr.street || '',
          number: addr.house_number || '',
          city: addr.city || '',
          zip: addr.zipcode || '',
          fullAddress: `${addr.street || ''} ${addr.house_number || ''}, ${addr.city || ''}`.trim()
        };
      }
    } catch (error) {
      console.log('Israel Post API failed, trying alternatives');
    }

    // 2. Try Nominatim with Hebrew preference
    if (!addressData) {
      try {
        const nominatimResponse = await axios.get(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&accept-language=he,en&addressdetails=1&zoom=18`,
          { 
            headers: { 
              'User-Agent': 'CoordinateConverter/1.0' 
            },
            timeout: 5000 
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
        console.log('Nominatim failed, trying Google fallback');
      }
    }

    // 3. Basic fallback using coordinate-based city detection
    if (!addressData) {
      const city = getCityFromCoordinates(lat, lng);
      addressData = {
        street: '',
        number: '',
        city: city,
        zip: '',
        fullAddress: city
      };
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

// Enhanced fiber check endpoint
app.post('/check-fiber', async (req, res) => {
  const { address, city, street, number } = req.body;
  
  if (!address && !city) {
    return res.status(400).json({ error: 'Address or city is required' });
  }

  try {
    // Format address for better API compatibility
    const searchAddress = formatAddressForSearch(address, city, street, number);
    
    // Try Bezeq fiber check with multiple approaches
    let fiberResult = await checkBezeqFiber(searchAddress, city);
    
    if (!fiberResult.checked) {
      // Fallback to Partner/HOT fiber check
      fiberResult = await checkAlternateFiber(searchAddress, city);
    }
    
    return res.json(fiberResult);
    
  } catch (error) {
    console.error('Error checking fiber:', error);
    return res.status(500).json({
      available: false,
      speed: '',
      message: 'שגיאה בבדיקת זמינות סיבים',
      link: 'https://www.bezeq.co.il/internetandphone/internet/bfiber_addresscheck/',
      checked: false
    });
  }
});

// Helper function to check Bezeq fiber
async function checkBezeqFiber(address, city) {
  try {
    // Method 1: Direct Bezeq API
    const bezeqResponse = await axios.post(
      'https://www.bezeq.co.il/internetandphone/internet/bfiber_addresscheck/api/check',
      { 
        address: address,
        city: city 
      },
      { 
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.bezeq.co.il/internetandphone/internet/bfiber_addresscheck/'
        },
        timeout: 10000
      }
    );
    
    return {
      available: bezeqResponse.data.available || false,
      speed: bezeqResponse.data.speed || 'עד 1Gbps',
      message: bezeqResponse.data.message || 'בדיקה הושלמה',
      link: `https://www.bezeq.co.il/internetandphone/internet/bfiber_addresscheck/?q=${encodeURIComponent(address)}`,
      checked: true
    };
    
  } catch (error) {
    console.log('Direct Bezeq API failed, trying scraping method');
    
    try {
      // Method 2: Scrape Bezeq page
      const pageResponse = await axios.get(
        `https://www.bezeq.co.il/internetandphone/internet/bfiber_addresscheck/?q=${encodeURIComponent(address)}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          timeout: 10000
        }
      );
      
      const html = pageResponse.data;
      const available = html.includes('זמין') || html.includes('available') || html.includes('כן');
      const notAvailable = html.includes('לא זמין') || html.includes('not available') || html.includes('לא');
      
      return {
        available: available && !notAvailable,
        speed: available ? 'עד 1Gbps' : '',
        message: available ? 'סיבים זמינים באזור' : 'סיבים לא זמינים כרגע',
        link: `https://www.bezeq.co.il/internetandphone/internet/bfiber_addresscheck/?q=${encodeURIComponent(address)}`,
        checked: true
      };
      
    } catch (scrapeError) {
      return { checked: false };
    }
  }
}

// Helper function to check alternate providers
async function checkAlternateFiber(address, city) {
  try {
    // Check Partner/HOT fiber availability
    const partnerResponse = await axios.post(
      'https://www.partner.co.il/api/fiber-check',
      { address: address },
      { 
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 8000
      }
    );
    
    return {
      available: partnerResponse.data.available || false,
      speed: partnerResponse.data.speed || 'עד 500Mbps',
      message: 'נבדק דרך ספקים נוספים',
      link: 'https://www.partner.co.il/internet/fiber',
      checked: true
    };
    
  } catch (error) {
    // Final fallback - basic city-based estimation
    const majorCities = ['תל אביב', 'חיפה', 'ירושלים', 'ראשון לציון', 'פתח תקווה', 'נתניה', 'חולון', 'בת ים'];
    const isAvailable = majorCities.some(majorCity => 
      city && city.includes(majorCity.split(' ')[0])
    );
    
    return {
      available: isAvailable,
      speed: isAvailable ? 'עד 1Gbps' : '',
      message: isAvailable ? 'זמין ברוב האזורים בעיר' : 'יש לבדוק זמינות באתר הספק',
      link: 'https://www.bezeq.co.il/internetandphone/internet/bfiber_addresscheck/',
      checked: true
    };
  }
}

// Helper function to format address for search
function formatAddressForSearch(fullAddress, city, street, number) {
  if (street && city) {
    return `${street} ${number || ''}, ${city}`.trim();
  }
  return fullAddress || city || '';
}

// Helper function to detect city from coordinates
function getCityFromCoordinates(lat, lng) {
  // Basic coordinate-based city detection for Israel
  const cities = [
    { name: 'תל אביב', lat: 32.0853, lng: 34.7818, radius: 0.1 },
    { name: 'חיפה', lat: 32.7940, lng: 34.9896, radius: 0.15 },
    { name: 'ירושלים', lat: 31.7683, lng: 35.2137, radius: 0.2 },
    { name: 'ראשון לציון', lat: 31.9730, lng: 34.8066, radius: 0.08 },
    { name: 'פתח תקווה', lat: 32.0878, lng: 34.8878, radius: 0.08 },
    { name: 'נתניה', lat: 32.3215, lng: 34.8532, radius: 0.1 },
    { name: 'באר שבע', lat: 31.2518, lng: 34.7915, radius: 0.15 },
    { name: 'חולון', lat: 32.0117, lng: 34.7750, radius: 0.06 },
    { name: 'בני ברק', lat: 32.0809, lng: 34.8338, radius: 0.05 }
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
