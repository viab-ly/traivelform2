/**
 * TravMDform — Onboarding Form Script
 * =====================================
 * Generates QR1 (Personal + Travel) and QR2 (Medical) codes as plain JSON.
 * Uses marker-based transliteration for German special characters.
 *
 * CDN dependencies: kjua (QR generation), jsPDF (PDF export)
 */

document.addEventListener('DOMContentLoaded', function() {
    var generateQRButton = document.getElementById('generateQR');
    var createPDFButton = document.getElementById('createPDF');
    var resetButton = document.getElementById('resetForm');

    // =========================================
    // INTERNATIONALIZATION (i18n)
    // =========================================

    var currentLang = 'de';

    /**
     * Retrieve a translated string for the current language.
     * Falls back to German if key or language is missing.
     */
    function t(key) {
        var strings = window.I18N && window.I18N.strings;
        if (!strings || !strings[key]) return key;
        return strings[key][currentLang] || strings[key].de || key;
    }

    /**
     * Apply translations to all elements with data-i18n / data-i18n-ph attributes.
     */
    function applyTranslations() {
        var elements = document.querySelectorAll('[data-i18n]');
        for (var i = 0; i < elements.length; i++) {
            var key = elements[i].getAttribute('data-i18n');
            elements[i].textContent = t(key);
        }
        var phElements = document.querySelectorAll('[data-i18n-ph]');
        for (var j = 0; j < phElements.length; j++) {
            var phKey = phElements[j].getAttribute('data-i18n-ph');
            phElements[j].placeholder = t(phKey);
        }
    }

    /**
     * Switch the form language and persist in localStorage.
     */
    function switchLanguage(langCode) {
        currentLang = langCode;
        try { localStorage.setItem('travmdform_lang', langCode); } catch (e) { /* ignore */ }
        document.documentElement.lang = langCode;
        document.title = t('pageTitle');
        applyTranslations();

        // Update active button
        var buttons = document.querySelectorAll('.lang-btn');
        for (var i = 0; i < buttons.length; i++) {
            if (buttons[i].getAttribute('data-lang') === langCode) {
                buttons[i].classList.add('active');
            } else {
                buttons[i].classList.remove('active');
            }
        }
    }

    /**
     * Build the language switcher pill buttons from I18N.languages.
     */
    function initLanguageSwitcher() {
        var container = document.getElementById('langSwitcher');
        if (!container || !window.I18N || !window.I18N.languages) return;

        var langs = window.I18N.languages;
        for (var i = 0; i < langs.length; i++) {
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'lang-btn';
            btn.setAttribute('data-lang', langs[i].code);
            btn.textContent = langs[i].flag + ' ' + langs[i].label;
            btn.addEventListener('click', (function(code) {
                return function() { switchLanguage(code); };
            })(langs[i].code));
            container.appendChild(btn);
        }

        // Restore saved language or default to German
        var saved = 'de';
        try { saved = localStorage.getItem('travmdform_lang') || 'de'; } catch (e) { /* ignore */ }
        switchLanguage(saved);
    }

    // =========================================
    // TRANSLITERATION
    // =========================================

    /**
     * Replace German umlauts and ss with marked ASCII equivalents.
     * Uses {}-markers so the app can reverse the transliteration unambiguously:
     *   ae -> {ae}, oe -> {oe}, ue -> {ue}, ss -> {ss}  (and uppercase variants)
     * This avoids encoding issues in both HID (QWERTZ) and COM (GBK) scanner modes.
     */
    function transliterateGerman(str) {
        return str
            .replace(/\u00e4/g, '{ae}').replace(/\u00c4/g, '{Ae}')
            .replace(/\u00f6/g, '{oe}').replace(/\u00d6/g, '{Oe}')
            .replace(/\u00fc/g, '{ue}').replace(/\u00dc/g, '{Ue}')
            .replace(/\u00df/g, '{ss}');
    }

    // =========================================
    // QR CODE GENERATION (always plain JSON)
    // =========================================

    function createQRCode(elementId, data) {
        var container = document.getElementById(elementId);
        container.innerHTML = '';

        var jsonString = JSON.stringify(data);

        var qrcode = kjua({
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

    // =========================================
    // DATE INPUT MASK (DD.MM.YYYY)
    // =========================================

    var gebInput = document.getElementById('geb');
    if (gebInput) {
        gebInput.addEventListener('input', function(e) {
            var value = e.target.value;

            // Remove any non-digit and non-dot characters
            var cleaned = value.replace(/[^\d.]/g, '');

            // Auto-insert dots after DD and MM
            var digits = cleaned.replace(/\./g, '');
            var result = '';
            for (var i = 0; i < digits.length && i < 8; i++) {
                if (i === 2 || i === 4) {
                    result += '.';
                }
                result += digits[i];
            }

            e.target.value = result;

            // Validate the complete date
            validateDateField(e.target);
        });

        gebInput.addEventListener('blur', function(e) {
            validateDateField(e.target);
        });
    }

    function validateDateField(input) {
        var value = input.value;
        var match = value.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
        if (!match) {
            // Incomplete — remove validation state
            input.classList.remove('valid', 'invalid');
            return;
        }

        var day = parseInt(match[1], 10);
        var month = parseInt(match[2], 10);
        var year = parseInt(match[3], 10);
        var currentYear = new Date().getFullYear();

        if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900 && year <= currentYear) {
            input.classList.add('valid');
            input.classList.remove('invalid');
        } else {
            input.classList.add('invalid');
            input.classList.remove('valid');
        }
    }

    // =========================================
    // DEPARTURE DATE: min = today
    // =========================================

    var abreiseInput = document.getElementById('abreisetermin');
    if (abreiseInput) {
        abreiseInput.min = new Date().toISOString().split('T')[0];
    }

    // =========================================
    // MEDICAL DETAIL FIELDS: show/hide toggle
    // =========================================

    var detailMap = {
        q1: 'q1_detail',
        q2: 'q2_detail',
        q7: 'q7_detail',
        q9: 'q9_detail',
    };

    function setupDetailToggle(questionName, detailId) {
        var detailInput = document.getElementById(detailId);
        if (!detailInput) return;

        // Hide initially
        detailInput.style.display = 'none';

        var radios = document.querySelectorAll('input[name="' + questionName + '"]');
        for (var i = 0; i < radios.length; i++) {
            radios[i].addEventListener('change', function() {
                if (this.value === 'ja') {
                    detailInput.style.display = 'block';
                } else {
                    detailInput.style.display = 'none';
                    detailInput.value = '';
                }
            });
        }
    }

    var detailKeys = Object.keys(detailMap);
    for (var k = 0; k < detailKeys.length; k++) {
        setupDetailToggle(detailKeys[k], detailMap[detailKeys[k]]);
    }

    // =========================================
    // QR GENERATION
    // =========================================

    generateQRButton.addEventListener('click', function() {
        var t = transliterateGerman;

        // Duration value: keep parenthesized form Tag(e), Woche(n) etc.
        var durationUnit = document.getElementById('reisedauer_unit').value;

        // Collect personal + travel data (QR1)
        var personalData = {
            ti: t(document.getElementById('titel').value),
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
            em: document.getElementById('email').value,
            ph: document.getElementById('telefon').value,
            rs: document.getElementById('reisestil').value
        };

        // Collect medical data (QR2)
        var medicalData = {
            q1: (document.querySelector('input[name="q1"]:checked') || {}).value || '',
            q1d: t(document.getElementById('q1_detail').value),
            q2: (document.querySelector('input[name="q2"]:checked') || {}).value || '',
            q2d: t(document.getElementById('q2_detail').value),
            q3: (document.querySelector('input[name="q3"]:checked') || {}).value || '',
            q4: (document.querySelector('input[name="q4"]:checked') || {}).value || '',
            q5: (document.querySelector('input[name="q5"]:checked') || {}).value || '',
            q6: (document.querySelector('input[name="q6"]:checked') || {}).value || '',
            q7: (document.querySelector('input[name="q7"]:checked') || {}).value || '',
            q7d: t(document.getElementById('q7_detail').value),
            q8: (document.querySelector('input[name="q8"]:checked') || {}).value || '',
            q9: (document.querySelector('input[name="q9"]:checked') || {}).value || '',
            q9d: t(document.getElementById('q9_detail').value),
            q10: (document.querySelector('input[name="q10"]:checked') || {}).value || '',
            q11: (document.querySelector('input[name="q11"]:checked') || {}).value || '',
            q12: (document.querySelector('input[name="q12"]:checked') || {}).value || ''
        };

        // Generate QR codes
        createQRCode('personalQR', personalData);
        createQRCode('medicalQR', medicalData);
    });

    // =========================================
    // FORM RESET
    // =========================================

    if (resetButton) {
        resetButton.addEventListener('click', function() {
            document.getElementById('medicalForm').reset();
            document.getElementById('personalQR').innerHTML = '';
            document.getElementById('medicalQR').innerHTML = '';

            // Hide detail fields again
            var detailIds = Object.keys(detailMap);
            for (var i = 0; i < detailIds.length; i++) {
                var el = document.getElementById(detailMap[detailIds[i]]);
                if (el) el.style.display = 'none';
            }

            // Reset validation classes
            var inputs = document.querySelectorAll('input.valid, input.invalid');
            for (var j = 0; j < inputs.length; j++) {
                inputs[j].classList.remove('valid', 'invalid');
            }
        });
    }

    // =========================================
    // PDF GENERATION
    // =========================================

    createPDFButton.addEventListener('click', function() {
        var jsPDF = window.jspdf.jsPDF;
        var doc = new jsPDF();

        // Set font and colors
        doc.setFont('helvetica', 'bold');

        // Add title
        doc.setFontSize(18);
        doc.setTextColor(0, 100, 0);
        doc.text('Reisemedizinische Beratung / Impfung', 105, 20, { align: 'center' });

        // Add subtitle
        doc.setFontSize(10);
        doc.setTextColor(0, 0, 0);
        doc.setFont('helvetica', 'normal');
        doc.text('Bitte vor jeder Impfung/Beratung ausfuellen und dem Arzt/der Aerztin uebergeben.', 105, 28, { align: 'center' });

        function drawBlock(y, height, color) {
            doc.setFillColor(color[0], color[1], color[2]);
            doc.rect(0, y, 210, height, 'F');
        }

        // Block 1: Personal Information (light green)
        drawBlock(35, 50, [232, 245, 233]);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.setTextColor(0, 0, 0);
        doc.text('Persoenliche Daten', 20, 43);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);

        var titelVal = document.getElementById('titel').value;
        var nameDisplay = (titelVal ? titelVal + ' ' : '') + document.getElementById('vorname').value + ' ' + document.getElementById('name').value;
        doc.text('Name: ' + nameDisplay, 20, 50);
        doc.text('Geburtsdatum: ' + document.getElementById('geb').value, 20, 56);
        doc.text('Adresse: ' + document.getElementById('strasse').value, 20, 62);
        doc.text(document.getElementById('plz').value + ' ' + document.getElementById('ort').value, 20, 68);
        doc.text('E-Mail: ' + document.getElementById('email').value, 20, 74);
        doc.text('Tel./Mobil: ' + document.getElementById('telefon').value, 110, 74);

        // Block 2: Travel Information (light yellow)
        drawBlock(85, 55, [255, 253, 231]);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('Reiseinformationen', 20, 93);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        var destinations = [
            document.getElementById('reiseland1').value,
            document.getElementById('reiseland2').value,
            document.getElementById('reiseland3').value,
            document.getElementById('reiseland4').value,
            document.getElementById('reiseland5').value,
            document.getElementById('reiseland6').value
        ].filter(function(d) { return d; }).join(', ');

        var maxWidth = 170;
        var wrappedDestinations = doc.splitTextToSize('Reiselaender: ' + destinations, maxWidth);
        doc.text(wrappedDestinations, 20, 100);

        var moreCountries = document.getElementById('more_countries').checked;
        doc.text('Mehr als 6 Laender: ' + (moreCountries ? 'Ja' : 'Nein'), 20, 113);
        doc.text('Abreisetermin: ' + document.getElementById('abreisetermin').value, 20, 119);
        doc.text('Reisedauer: ' + document.getElementById('reisedauer_number').value + ' ' + document.getElementById('reisedauer_unit').value, 20, 125);
        var reisestil = document.getElementById('reisestil').value;
        if (reisestil) {
            var selectedOption = document.querySelector('#reisestil option[value="' + reisestil + '"]');
            doc.text('Reisestil: ' + (selectedOption ? selectedOption.textContent : reisestil), 20, 131);
        }

        // Block 3: Medical Information (light grey)
        drawBlock(145, 115, [245, 245, 245]);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        doc.text('Medizinische Informationen', 20, 153);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        function getQuestionAnswer(questionName) {
            var radioButton = document.querySelector('input[name="' + questionName + '"]:checked');
            return radioButton ? radioButton.value : 'Keine Angabe';
        }

        var questions = [
            { q: 'Akute/chronische Erkrankung:', a: getQuestionAnswer('q1') },
            { q: 'Detail:', a: document.getElementById('q1_detail').value },
            { q: 'Medikamente:', a: getQuestionAnswer('q2') },
            { q: 'Detail:', a: document.getElementById('q2_detail').value },
            { q: 'Immunsuppression:', a: getQuestionAnswer('q3') },
            { q: 'Thymusdruese entfernt:', a: getQuestionAnswer('q4') },
            { q: 'Psychische Erkrankung oder Krampfanfaelle:', a: getQuestionAnswer('q5') },
            { q: 'Huehnereiweissallergie:', a: getQuestionAnswer('q6') },
            { q: 'Allergien:', a: getQuestionAnswer('q7') },
            { q: 'Detail:', a: document.getElementById('q7_detail').value },
            { q: 'Gelbfieber-Aufklaerungsblatt gelesen:', a: getQuestionAnswer('q8') },
            { q: 'Impfungen letzte 4 Wochen:', a: getQuestionAnswer('q9') },
            { q: 'Detail:', a: document.getElementById('q9_detail').value },
            { q: 'Impfsynkope:', a: getQuestionAnswer('q10') },
            { q: 'Medikamentenunvertraeglichkeit:', a: getQuestionAnswer('q11') },
            { q: 'Schwangerschaft/Stillen:', a: getQuestionAnswer('q12') }
        ];

        var yPos = 160;
        var lineHeight = 5;
        for (var i = 0; i < questions.length; i++) {
            var text = questions[i].q + ' ' + questions[i].a;
            if (yPos + lineHeight <= 255) {
                var wrappedText = doc.splitTextToSize(text, maxWidth);
                doc.text(wrappedText, 20, yPos);
                yPos += (wrappedText.length * lineHeight);
            }
        }

        // Signature boxes
        doc.setDrawColor(0);
        doc.setLineWidth(0.5);
        doc.setFontSize(10);
        doc.text('Datum:', 20, 250);
        doc.rect(20, 255, 70, 20);
        doc.text('Unterschrift:', 110, 250);
        doc.rect(110, 255, 70, 20);

        // QR codes page
        doc.addPage();

        var personalQR = document.getElementById('personalQR').querySelector('canvas');
        var medicalQR = document.getElementById('medicalQR').querySelector('canvas');

        if (personalQR && medicalQR) {
            doc.addImage(personalQR.toDataURL(), 'PNG', 20, 20, 80, 80);
            doc.text('Persoenliche Daten (QR 1)', 60, 110, { align: 'center' });

            doc.addImage(medicalQR.toDataURL(), 'PNG', 20, 140, 80, 80);
            doc.text('Medizinische Daten (QR 2)', 60, 230, { align: 'center' });
        }

        doc.save('reisemedizin-formular.pdf');
    });

    // =========================================
    // i18n INIT (last, so all listeners above are already attached)
    // =========================================

    try {
        initLanguageSwitcher();
    } catch (e) {
        console.warn('i18n init failed:', e);
    }
});
