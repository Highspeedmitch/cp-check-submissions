const express = require('express');
const cors = require('cors');
const { generateChecklistPDF } = require('./pdfservice');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 5000;

const propertyEmailMap = {
    'San Clemente': 'Nfurrier@picor.com',
    'Broadway Center': 'Gfurrier@picor.com',
    '22 & Harrison': 'Highspeedmitch@gmail.com',
};

let lastSubmission = null;

app.use(cors());
app.use(express.json());

app.post('/submit-form', async (req, res) => {
    try {
        const data = req.body;
        console.log('Form Data Received:', data);
        lastSubmission = data;
        return res.status(200).json({ message: 'Checklist submitted successfully! Please click "Download PDF".' });
    } catch (error) {
        console.error('Error processing form submission:', error);
        return res.status(500).json({ message: 'An error occurred while processing your submission.' });
    }
});

app.get('/download-pdf', async (req, res) => {
    try {
        if (!lastSubmission) {
            return res.status(400).json({ message: 'No form submission found. Please submit the form first.' });
        }

        const pdfStream = await generateChecklistPDF(lastSubmission);

        if (!pdfStream || typeof pdfStream.pipe !== 'function') {
            throw new Error('PDF generation failed - no valid stream received');
        }

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=checklist.pdf`);
        pdfStream.pipe(res); // ✅ Pipe the valid stream

        // Email logic after file is created
        const recipientEmail = propertyEmailMap[lastSubmission.selectedProperty] || 'highspeedmitch@gmail.com';
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: { user: 'highspeedmitch@gmail.com', pass: 'tevt ennm rldu azeh' },
        });

        const mailOptions = {
            from: 'highspeedmitch@gmail.com',
            to: recipientEmail,
            subject: `Checklist PDF for ${lastSubmission.selectedProperty} - Submitted on ${new Date().toLocaleString()}`,
            text: `Hello! Attached is the checklist PDF for ${lastSubmission.selectedProperty}.`,
            attachments: [{ filename: 'checklist.pdf', path: path.join(__dirname, 'pdfstore', 'checklist.pdf') }],
        };

        transporter.sendMail(mailOptions)
            .then(() => console.log(`Email sent to ${recipientEmail}`))
            .catch((err) => console.error('Error sending email:', err));

    } catch (error) {
        console.error('PDF generation error:', error);
        res.status(500).json({ message: 'Error generating PDF' });
    }
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
