// ייבוא הספריות הדרושות
const express = require('express');
const axios = require('axios');
const cors = require('cors');

// יצירת אפליקציית שרת
const app = express();
const PORT = process.env.PORT || 3000;

// הפעלת CORS כדי לאפשר לאתר שלך לתקשר עם השרת הזה
app.use(cors());
// הגשה של קבצים סטטיים מהתיקייה הנוכחית (כדי להגיש את index.html)
app.use(express.static('.'));

// הגדרת נקודת קצה (endpoint) לבדיקת הסיבים
app.get('/check-fiber', async (req, res) => {
    const address = req.query.address;

    if (!address) {
        return res.status(400).send({ error: 'Address query parameter is required' });
    }

    try {
        // הכתובת אליה השרת שלנו יפנה (השרת של ZOL)
        const zolUrl = 'https://www.zol-li.co.il/wp-admin/admin-ajax.php';
        
        // הכנת הנתונים לשליחה בפורמט ש-ZOL מצפה לו
        const params = new URLSearchParams();
        params.append('action', 'fiber_address_check');
        params.append('address', address);

        // שליחת בקשת POST לשרת של ZOL
        const response = await axios.post(zolUrl, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
            }
        });

        // החזרת התשובה שקיבלנו מ-ZOL ישירות חזרה לאתר שלנו
        res.send(response.data);

    } catch (error) {
        console.error('Error fetching fiber data:', error);
        res.status(500).send({ error: 'Failed to fetch fiber availability' });
    }
});

// הפעלת השרת והאזנה לבקשות
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
