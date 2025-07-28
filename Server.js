const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// נתיב לבדיקת סיבים אופטיים
app.post('/check-fiber', async (req, res) => {
    const { address } = req.body;
    
    if (!address) {
        return res.status(400).json({ error: 'Address is required' });
    }

    try {
        // 1. ננסה לבדוק מול אתר בזק ישירות
        let bezeqResult = null;
        try {
            const bezeqResponse = await axios.post(
                'https://www.bezeq.co.il/internetandphone/internet/bfiber_addresscheck/checkAddress',
                { address: address },
                { headers: { 'Content-Type': 'application/json' } }
            );
            bezeqResult = bezeqResponse.data;
        } catch (e) {
            console.log('Bezeq direct API not available, using fallback');
        }

        // 2. אם לא הצלחנו, נשתמש ב-ZOL כגיבוי
        if (!bezeqResult) {
            const zolResponse = await axios.post(
                'https://www.zol-li.co.il/wp-admin/admin-ajax.php',
                `action=fiber_address_check&address=${encodeURIComponent(address)}`,
                { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
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
        }

        // 3. אם קיבלנו תשובה מבזק
        return res.json({
            available: bezeqResult.available,
            speed: bezeqResult.speed || 'עד 1Gbps',
            message: bezeqResult.message || (bezeqResult.available ? 'הכתובת זכאית לחיבור סיבים אופטיים' : 'הכתובת אינה זכאית כרגע'),
            link: `https://www.bezeq.co.il/internetandphone/internet/bfiber_addresscheck/?address=${encodeURIComponent(address)}`
        });
        
    } catch (error) {
        console.error('Error checking fiber:', error);
        return res.status(500).json({
            error: 'Failed to check fiber availability',
            details: error.message
        });
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
