const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');

exports.handler = async function(event, context) {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const payload = JSON.parse(event.body);

        if (payload.event === 'payment.captured') {
            const payment = payload.payload.payment.entity;
            const donorName = payment.notes.name || payment.name || 'Donor';
            const donorEmail = payment.email;
            const donorPhone = payment.contact || payment.notes.phone || 'N/A';
            const donorPan = (payment.notes.pan_number || 'N/A').toUpperCase();
            const donorAddress = payment.notes.address || 'Not Provided';
            const purpose = payment.notes.purpose || 'General Charitable Purpose (Mercy Home & Community Care)';
            
            const amount = payment.amount / 100;
            const paymentId = payment.id;
            const paymentMethod = (payment.method || 'Online').toUpperCase();
            
            const dateObj = new Date(payment.created_at * 1000);
            const paymentDate = dateObj.toLocaleDateString('en-IN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });

            // Generate a unique sequential-style receipt number
            const receiptNo = `SCF/2026-27/${paymentId.slice(-6).toUpperCase()}`;

            // 1. Generate Legally Compliant PDF Receipt in Memory
            const pdfBuffer = await new Promise((resolve, reject) => {
                const doc = new PDFDocument({ size: 'A4', margin: 50 });
                let buffers = [];

                doc.on('data', buffers.push.bind(buffers));
                doc.on('end', () => resolve(Buffer.concat(buffers)));
                doc.on('error', reject);

                // Organization Header
                doc.fontSize(18).font('Helvetica-Bold').text('SEBAMA CHARITABLE FOUNDATION', { align: 'center' });
                doc.moveDown(0.3);
                doc.fontSize(9.5).font('Helvetica').text('Mercy Home, Nazarethur, Sogathur Post, Dharmapuri District, Tamil Nadu - 636701', { align: 'center' });
                doc.text('Email: contact@sebama.org | Phone: +91 9916665739 | Web: sebama.in', { align: 'center' });
                doc.moveDown(0.5);

                // Statutory Registration Bar (Domestic 80G Focus)
                doc.fontSize(9.5).font('Helvetica-Bold');
                doc.text('Trust Reg. No: 234/98  |  Trust PAN: AADTS3827J  |  80G URN: AADTS3827JE20218', { align: 'center' });
                
                doc.moveDown(0.8);
                doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
                doc.moveDown(1);

                // Receipt Title
                doc.fontSize(14).font('Helvetica-Bold').text('DONATION RECEIPT (80G)', { align: 'center' });
                doc.moveDown(1);

                // Receipt Meta Row
                const metaY = doc.y;
                doc.fontSize(10).font('Helvetica-Bold').text(`Receipt No.: ${receiptNo}`, 50, metaY);
                doc.text(`Date: ${paymentDate}`, 400, metaY, { align: 'right' });
                doc.moveDown(1.5);

                // Donor Details Section
                doc.fontSize(11).font('Helvetica-Bold').text('DONOR DETAILS');
                doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke();
                doc.moveDown(0.6);

                doc.fontSize(10).font('Helvetica');
                doc.text(`Donor Name : ${donorName}`);
                doc.moveDown(0.3);
                doc.font('Helvetica-Bold').text(`Donor PAN  : ${donorPan}`);
                doc.font('Helvetica').moveDown(0.3);
                doc.text(`Address    : ${donorAddress}`);
                doc.moveDown(0.3);
                doc.text(`Contact    : ${donorPhone} | ${donorEmail}`);
                doc.moveDown(1.5);

                // Contribution Details Section
                doc.fontSize(11).font('Helvetica-Bold').text('CONTRIBUTION DETAILS');
                doc.moveTo(50, doc.y + 2).lineTo(545, doc.y + 2).stroke();
                doc.moveDown(0.6);

                doc.fontSize(10).font('Helvetica');
                doc.font('Helvetica-Bold').text(`Amount Received     : INR ${amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`);
                doc.font('Helvetica').moveDown(0.3);
                doc.text(`Mode of Payment     : ${paymentMethod} (Razorpay Gateway)`);
                doc.moveDown(0.3);
                doc.text(`Transaction Ref. ID : ${paymentId}`);
                doc.moveDown(0.3);
                doc.text(`Purpose / Fund      : ${purpose}`);
                doc.moveDown(1.5);

                // Statutory Declaration Box
                doc.fontSize(9.5).font('Helvetica-Bold').text('STATUTORY DECLARATION FOR TAX DEDUCTION');
                doc.moveDown(0.3);
                doc.font('Helvetica').fontSize(9).text(
                    'Donations made to Sebama Charitable Foundation are eligible for 50% tax deduction under Section 80G of the Income Tax Act, 1961 (and corresponding provisions of the Income-tax Act, 2025), vide 80G Approval URN AADTS3827JE20218.'
                );
                doc.moveDown(0.4);
                doc.text(
                    'Your annual statutory tax deduction certificate (Form 10BE) will be generated and issued after our annual statement of donations (Form 10BD) is filed with the Income Tax Department.'
                );
                doc.moveDown(3);

                // Signatory Section
                doc.fontSize(10).font('Helvetica-Bold').text('For Sebama Charitable Foundation', { align: 'right' });
                doc.moveDown(2);
                doc.font('Helvetica').text('Authorized Signatory / Executive Trustee', { align: 'right' });
                doc.fontSize(8).text('(This is a computer-generated receipt and does not require a physical signature)', { align: 'center' });

                doc.end();
            });

            // 2. Configure Email Transport
            let transporter = nodemailer.createTransport({
                service: 'gmail',
                auth: {
                    user: process.env.EMAIL_USER,
                    pass: process.env.EMAIL_PASS
                }
            });

            // 3. Send Email with PDF Attachment
            let mailOptions = {
                from: `"Sebama Charitable Foundation" <${process.env.EMAIL_USER}>`,
                to: donorEmail,
                subject: `80G Donation Receipt (${receiptNo}) - Sebama Charitable Foundation`,
                text: `Dear ${donorName},\n\nThank you for your generous donation of INR ${amount.toLocaleString('en-IN')} to Sebama Charitable Foundation.\n\nPlease find attached your official donation receipt (Receipt No: ${receiptNo}) bearing our 80G URN (AADTS3827JE20218) and Trust PAN (AADTS3827J).\n\nYour annual Form 10BE tax certificate will be issued following our statutory Form 10BD filing.\n\nWith gratitude,\nSebama Charitable Foundation\nDharmapuri, Tamil Nadu`,
                attachments: [
                    {
                        filename: `Sebama_80G_Receipt_${receiptNo.replace(/\//g, '-')}.pdf`,
                        content: pdfBuffer,
                        contentType: 'application/pdf'
                    }
                ]
            };

            await transporter.sendMail(mailOptions);
        }

        return { statusCode: 200, body: JSON.stringify({ received: true }) };
    } catch (error) {
        console.error('PDF Generation or Email error:', error);
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};