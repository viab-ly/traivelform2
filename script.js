document.addEventListener('DOMContentLoaded', function() {
    const generateQRButton = document.getElementById('generateQR');
    const createPDFButton = document.getElementById('createPDF');

    // Encode a string as Base64 with correct UTF-8 handling.
    // Base64 uses only A-Z, a-z, 0-9, +, /, = — no AltGr-dependent characters,
    // which makes it far more reliable for HID barcode scanners on QWERTZ keyboards.
    function utf8ToBase64(str) {
        const bytes = new TextEncoder().encode(str);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    // Replace German umlauts and ß with ASCII equivalents.
    // HID scanners cannot type multi-byte UTF-8 characters — they interpret
    // each byte separately through the keyboard layout, producing garbled output
    // (e.g. ü → ¨¹, ß → dropped). Standard German transliteration avoids this.
    function transliterateGerman(str) {
        return str
            .replace(/ä/g, 'ae').replace(/Ä/g, 'Ae')
            .replace(/ö/g, 'oe').replace(/Ö/g, 'Oe')
            .replace(/ü/g, 'ue').replace(/Ü/g, 'Ue')
            .replace(/ß/g, 'ss');
    }

    // Read QR format from the toggle dropdown
    function getQrFormat() {
        const select = document.getElementById('qrFormat');
        return select ? select.value : 'base64';
    }

    function createQRCode(elementId, data) {
        const container = document.getElementById(elementId);
        container.innerHTML = ''; // Clear previous QR code

        const format = getQrFormat();
        let jsonString;

        if (format === 'base64') {
            // W4: Base64-encoded JSON — scanner-safe, no AltGr chars
            jsonString = utf8ToBase64(JSON.stringify(data));
        } else {
            // W3-fix: Plain JSON — compatible with old app, no escapeNonAscii
            jsonString = JSON.stringify(data);
        }

        // Create QR code optimized for screen and print scanning
        const qrcode = kjua({
            text: jsonString,
            size: 400,
            render: 'canvas',
            crisp: true,
            minVersion: 1,
            ecLevel: 'Q',
            back: '#ffffff',
            fill: '#000000',
            quiet: 4,
        });

        container.appendChild(qrcode);
    }

    generateQRButton.addEventListener('click', function() {
        const format = getQrFormat();

        // Duration value: in W3-fix mode, strip parentheses to avoid Shift-timing
        // issues on QWERTZ scanners. parseDuration() in the app matches on the
        // prefix (Tag|Woche|Monat|Jahr) so "Tage" works just as well as "Tag(e)".
        let durationUnit = document.getElementById('reisedauer_unit').value;
        if (format === 'w3fix') {
            durationUnit = durationUnit
                .replace('Tag(e)', 'Tage')
                .replace('Woche(n)', 'Wochen')
                .replace('Monat(e)', 'Monate')
                .replace('Jahr(e)', 'Jahre');
        }

        // In W3-fix mode, transliterate all string values to pure ASCII
        const t = format === 'w3fix' ? transliterateGerman : function(s) { return s; };

        // Collect personal data
        const personalData = {
            fn: t(document.getElementById('vorname').value),
            ln: t(document.getElementById('name').value),
            bd: document.getElementById('geb').value,
            st: t(document.getElementById('strasse').value),
            pc: document.getElementById('plz').value,
            ct: t(document.getElementById('ort').value),
            ds1: t(document.getElementById('reiseland1').value),
            ds2: t(document.getElementById('reiseland2').value),
            ds3: t(document.getElementById('reiseland3').value),
            ds4: t(document.getElementById('reiseland4').value),
            ds5: t(document.getElementById('reiseland5').value),
            ds6: t(document.getElementById('reiseland6').value),
            mc: document.getElementById('more_countries').checked,
            dd: document.getElementById('abreisetermin').value.split('-').reverse().join('.'),
            dr: document.getElementById('reisedauer_number').value + ' ' + durationUnit,
            // In W3-fix mode, skip email to avoid @ (AltGr+Q) corrupting surrounding quotes
            em: format === 'w3fix' ? '' : document.getElementById('email').value,
            ph: document.getElementById('telefon').value,
            rs: document.getElementById('reisestil').value
        };

        // Collect medical data (detail fields can contain free text with umlauts)
        const medicalData = {
            q1: document.querySelector('input[name="q1"]:checked')?.value || '',
            q1d: t(document.getElementById('q1_detail').value),
            q2: document.querySelector('input[name="q2"]:checked')?.value || '',
            q2d: t(document.getElementById('q2_detail').value),
            q3: document.querySelector('input[name="q3"]:checked')?.value || '',
            q4: document.querySelector('input[name="q4"]:checked')?.value || '',
            q5: document.querySelector('input[name="q5"]:checked')?.value || '',
            q6: document.querySelector('input[name="q6"]:checked')?.value || '',
            q7: document.querySelector('input[name="q7"]:checked')?.value || '',
            q7d: t(document.getElementById('q7_detail').value),
            q8: document.querySelector('input[name="q8"]:checked')?.value || '',
            q9: document.querySelector('input[name="q9"]:checked')?.value || '',
            q9d: t(document.getElementById('q9_detail').value),
            q10: document.querySelector('input[name="q10"]:checked')?.value || '',
            q11: document.querySelector('input[name="q11"]:checked')?.value || '',
            q12: document.querySelector('input[name="q12"]:checked')?.value || ''
        };

        // Generate QR codes
        createQRCode('personalQR', personalData);
        createQRCode('medicalQR', medicalData);
    });

    createPDFButton.addEventListener('click', function() {
        // Create PDF document
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        // Set font and colors
        doc.setFont('helvetica', 'bold');

        // Add title
        doc.setFontSize(18);
        doc.setTextColor(0, 100, 0);  // Dark green color
        doc.text('Reisemedizinische Beratung / Impfung', 105, 20, { align: 'center' });

        // Add subtitle
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
        doc.text('Bitte vor jeder Impfung/Beratung ausfüllen und dem Arzt/der Ärztin übergeben.', 105, 28, { align: 'center' });

        // Function to draw a colored background block
        function drawBlock(y, height, color) {
            doc.setFillColor(...color);
            doc.rect(0, y, 210, height, 'F');
        }

        // Block 1: Personal Information (light green)
        drawBlock(35, 50, [232, 245, 233]); // #e8f5e9
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text('Persönliche Daten', 20, 43);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`Name: ${document.getElementById('name').value}`, 20, 50);
        doc.text(`Vorname: ${document.getElementById('vorname').value}`, 20, 56);
        doc.text(`Geburtsdatum: ${document.getElementById('geb').value}`, 20, 62);
        doc.text(`Adresse: ${document.getElementById('strasse').value}`, 20, 68);
        doc.text(`${document.getElementById('plz').value} ${document.getElementById('ort').value}`, 20, 74);
        doc.text(`E-Mail: ${document.getElementById('email').value}`, 20, 80);
        doc.text(`Tel./Mobil: ${document.getElementById('telefon').value}`, 110, 80);

        // Block 2: Travel Information (light yellow)
        drawBlock(90, 50, [255, 253, 231]); // Light yellow
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('Reiseinformationen', 20, 98);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        const destinations = [
            document.getElementById('reiseland1').value,
            document.getElementById('reiseland2').value,
            document.getElementById('reiseland3').value,
            document.getElementById('reiseland4').value,
            document.getElementById('reiseland5').value,
            document.getElementById('reiseland6').value
        ].filter(d => d).join(', ');

        // Handle long destination text with word wrap
        const maxWidth = 170;
        const wrappedDestinations = doc.splitTextToSize(`Reiseländer: ${destinations}`, maxWidth);
        doc.text(wrappedDestinations, 20, 105);

        const moreCountries = document.getElementById('more_countries').checked;
        doc.text(`Mehr als 6 Länder: ${moreCountries ? 'Ja' : 'Nein'}`, 20, 118);
        doc.text(`Abreisetermin: ${document.getElementById('abreisetermin').value}`, 20, 124);
        doc.text(`Reisedauer: ${document.getElementById('reisedauer_number').value} ${document.getElementById('reisedauer_unit').value}`, 20, 130);
        const reisestil = document.getElementById('reisestil').value;
        if (reisestil) {
            doc.text(`Reisestil: ${document.querySelector(`#reisestil option[value="${reisestil}"]`).textContent}`, 20, 136);
        }

        // Block 3: Medical Information (light grey)
        drawBlock(145, 115, [245, 245, 245]); // Light grey - increased height
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('Medizinische Informationen', 20, 153);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8); // Reduced font size
        function getQuestionAnswer(questionName) {
            const radioButton = document.querySelector(`input[name="${questionName}"]:checked`);
            return radioButton ? radioButton.value : 'Keine Angabe';
        }

        const questions = [
            { q: 'Akute/chronische Erkrankung:', a: getQuestionAnswer('q1') },
            { q: 'Detail:', a: document.getElementById('q1_detail').value },
            { q: 'Medikamente:', a: getQuestionAnswer('q2') },
            { q: 'Detail:', a: document.getElementById('q2_detail').value },
            { q: 'Immunsuppression:', a: getQuestionAnswer('q3') },
            { q: 'Thymusdrüse entfernt:', a: getQuestionAnswer('q4') },
            { q: 'Psychische Erkrankung oder Krampfanfälle:', a: getQuestionAnswer('q5') },
            { q: 'Hühnereiweißallergie:', a: getQuestionAnswer('q6') },
            { q: 'Allergien:', a: getQuestionAnswer('q7') },
            { q: 'Detail:', a: document.getElementById('q7_detail').value },
            { q: 'Gelbfieber-Aufklärungsblatt gelesen:', a: getQuestionAnswer('q8') },
            { q: 'Impfungen letzte 4 Wochen:', a: getQuestionAnswer('q9') },
            { q: 'Detail:', a: document.getElementById('q9_detail').value },
            { q: 'Impfsynkope:', a: getQuestionAnswer('q10') },
            { q: 'Medikamentenunverträglichkeit:', a: getQuestionAnswer('q11') },
            { q: 'Schwangerschaft/Stillen:', a: getQuestionAnswer('q12') }
        ];

        let yPos = 160;
        const lineHeight = 5; // Reduced line height
        questions.forEach(q => {
            // Always show the question and its answer, even if it's 'Keine Angabe'
            const text = `${q.q} ${q.a}`;
            if (yPos + lineHeight <= 255) {  // Increased max height to allow more content
                // Handle long text with word wrap
                const wrappedText = doc.splitTextToSize(text, maxWidth);
                doc.text(wrappedText, 20, yPos);
                yPos += (wrappedText.length * lineHeight);
            }
        });

        // Add signature boxes at the bottom
        doc.setDrawColor(0);
        doc.setLineWidth(0.5);

        // Datum box
        doc.setFontSize(10);
        doc.text('Datum:', 20, 250);
        doc.rect(20, 255, 70, 20);

        // Unterschrift box
        doc.text('Unterschrift:', 110, 250);
        doc.rect(110, 255, 70, 20);

        // Add new page for QR codes (keep existing QR code page implementation)
        doc.addPage();

        // Generate QR codes first
        const personalQR = document.getElementById('personalQR').querySelector('canvas');
        const medicalQR = document.getElementById('medicalQR').querySelector('canvas');

        if (personalQR && medicalQR) {
            // Add personal QR code at the top
            doc.addImage(personalQR.toDataURL(), 'PNG', 20, 20, 80, 80);
            doc.text('Personal Data QR', 60, 110, { align: 'center' });

            // Add medical QR code at the bottom with spacing
            doc.addImage(medicalQR.toDataURL(), 'PNG', 20, 140, 80, 80);
            doc.text('Medical Data QR', 60, 230, { align: 'center' });
        }

        // Save the PDF
        doc.save('medical-consultation-form.pdf');
    });
});
