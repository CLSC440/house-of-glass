function normalizeSideUpTranslationKey(value) {
    return String(value ?? '')
        .replace(/^eg_(cities|areas)\./i, '')
        .replace(/&/g, ' and ')
        .replace(/[أإآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي')
        .replace(/[\u200e\u200f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9\u0600-\u06ff]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const SIDEUP_TRANSLATION_GROUPS = Object.freeze([
    {
        name: 'Cairo & Giza',
        englishAreas: ['Nasr City', 'Heliopolis', 'Maadi', 'Downtown', 'Zamalek', 'Mohandessin', 'Dokki', 'Giza', 'Haram', 'New Cairo', '6th of October', 'Shubra', 'Abbassia', 'El Matareya', 'Ain Shams', 'Sheikh Zayed', 'Al Hawamdiya', 'Al Badrashin', 'Al Saf', 'Atfih', 'Al Ayyat', 'Al Omraniya', 'Kerdasa', 'Al Warraq', 'Ausim', 'El Salam City', 'Badr City', 'El Marg'],
        arabicAreas: ['مدينة نصر', 'مصر الجديدة', 'المعادي', 'وسط البلد', 'الزمالك', 'المهندسين', 'الدقي', 'الجيزة', 'الهرم', 'القاهرة الجديدة', 'السادس من أكتوبر', 'شبرا', 'العباسية', 'المطرية', 'عين شمس', 'الشيخ زايد', 'الحوامدية', 'البدراشين', 'الصف', 'أطفيح', 'العياط', 'العمرانية', 'كرداسة', 'وراق العرب', 'أوسيم', 'مدينة السلام', 'مدينة بدر', 'المرج']
    },
    {
        name: 'Alexandria',
        englishAreas: ['Smouha', 'Sidi Gaber', 'Montaza', 'Miami', 'Agami', 'Borg El Arab', 'Mandara', 'Rushdy', 'Laurens', 'El Azarita', 'Kom El Dekka', 'El Attarin', 'Kafr Abdo', 'Gianaclis'],
        arabicAreas: ['سموحة', 'سيدي جابر', 'المنتزه', 'ميامي', 'العجمي', 'برج العرب', 'المندرة', 'رشدي', 'لوران', 'الأزاريطة', 'كوم الدكة', 'العطارين', 'كفر عبده', 'جناكليس']
    },
    {
        name: 'Dakahlia',
        englishAreas: ['Mansoura', 'Talkha', 'Mit Ghamr', 'Aga', 'El Senbellawein', 'Meniet El Nasr', 'Dekernes', 'Sherbin', 'Belqas', 'Gamasa', 'Bani Ebeid'],
        arabicAreas: ['المنصورة', 'طلخا', 'ميت غمر', 'أجا', 'السنبلاوين', 'منية النصر', 'دكرنس', 'شربين', 'بلقاس', 'جمصة', 'بني عبيد']
    },
    {
        name: 'Sharkia',
        englishAreas: ['Zagazig', 'Belbeis', 'Abu Hammad', 'El Husseiniya', 'Minya Al Qamh', 'Faqous', 'Al Ibrahimiyah', '10th of Ramadan City', 'Hehya', 'El Qurein', 'Diarb Negm', 'Kafr Saqr', 'Awlad Saqr', 'El Salheya'],
        arabicAreas: ['الزقازيق', 'بلبيس', 'أبو حماد', 'الحسينية', 'منيا القمح', 'فاقوس', 'الإبراهيمية', 'مدينة العاشر من رمضان', 'ههيا', 'القرين', 'ديرب نجم', 'كفر صقر', 'أولاد صقر', 'الصالحية']
    },
    {
        name: 'Qalyubia',
        englishAreas: ['Banha', 'Shubra El Kheima', 'Qalyub', 'Khanka', 'Kafr Shukr', 'Qaha', 'Obour City', 'El Khsos', 'Shibin El Qanater', 'Tukh'],
        arabicAreas: ['بنها', 'شبرا الخيمة', 'قليوب', 'الخانكة', 'كفر شكر', 'قها', 'مدينة العبور', 'الخصوص', 'شبين القناطر', 'طوخ']
    },
    {
        name: 'Beheira',
        englishAreas: ['Damanhur', 'Kafr El Dawwar', 'Rashid', 'Abu El Matamir', 'Hosh Essa', 'Edku', 'Abu Hummus', 'Delengat', 'Mahmoudiya', 'Itay El Barud', 'Kom Hamada', 'El Nubariyah'],
        arabicAreas: ['دمنهور', 'كفر الدوار', 'رشيد', 'أبو المطامير', 'حوش عيسى', 'إدكو', 'أبو حمص', 'الدلنجات', 'المحمودية', 'إيتاي البارود', 'كوم حمادة', 'النوبارية']
    },
    {
        name: 'Gharbia',
        englishAreas: ['Tanta', 'El Mahalla El Kubra', 'Kafr El Zayat', 'Samannoud', 'Basyoun', 'Zifta', 'Qutur'],
        arabicAreas: ['طنطا', 'المحلة الكبرى', 'كفر الزيات', 'سمنود', 'بسيون', 'زفتى', 'قطور']
    },
    {
        name: 'Monufia',
        englishAreas: ['Shibin El Kom', 'Sadat City', 'Menouf', 'Ashmun', 'Quesna', 'Bagour', 'Tala', 'Berkat El Sab'],
        arabicAreas: ['شبين الكوم', 'مدينة السادات', 'منوف', 'أشمون', 'قويسنا', 'الباجور', 'تلا', 'بركة السبع']
    },
    {
        name: 'Minya',
        englishAreas: ['Minya', 'Mallawi', 'Beni Mazar', 'Matay', 'Deir Mawas', 'Abu Qurqas', 'Samalut', 'Maghagha', 'Adwa', 'Bani Mazar'],
        arabicAreas: ['المنيا', 'ملوي', 'بني مزار', 'مطاي', 'دير مواس', 'أبو قرقاص', 'سمالوط', 'مغاغة', 'العدوة', 'بني مزار']
    },
    {
        name: 'Assiut',
        englishAreas: ['Assiut', 'Dairut', 'Abnoub', 'El Qusiya', 'Manfalut', 'Sahel Selim', 'Al Fath', 'Al Badari', 'Al Qusiya', 'Abu Tig'],
        arabicAreas: ['أسيوط', 'ديروط', 'أبنوب', 'القوصية', 'منفلوط', 'ساحل سليم', 'الفتح', 'البداري', 'القوصية', 'أبو تيج']
    },
    {
        name: 'Sohag',
        englishAreas: ['Sohag', 'Akhmim', 'Girga', 'Tima', 'Tahta', 'El Maragha', 'Al Balyana', 'Al Monshah', 'Al Kawthar'],
        arabicAreas: ['سوهاج', 'أخميم', 'جرجا', 'طما', 'طهطا', 'المراغة', 'البلينا', 'المنشأة', 'الكوثر']
    },
    {
        name: 'Qena',
        englishAreas: ['Qena', 'Nag Hammadi', 'Deshna', 'Qus', 'Armant', 'Al Waqf', 'Abu Tesht', 'Farshout', 'Naga Hammadi'],
        arabicAreas: ['قنا', 'نجع حمادي', 'دشنا', 'قوص', 'أرمنت', 'الوقف', 'أبو تشت', 'فرشوط', 'نجع حمادي']
    },
    {
        name: 'Fayoum',
        englishAreas: ['Fayoum', 'Tamiya', 'Sinnuris', 'Ibsheway', 'Yusuf El Seddik', 'Itsa', 'Al Adwa', 'Ebshway', 'New Fayoum City'],
        arabicAreas: ['الفيوم', 'طامية', 'سنورس', 'إبشواي', 'يوسف الصديق', 'إطسا', 'العدوة', 'إبشواي', 'مدينة الفيوم الجديدة']
    },
    {
        name: 'Beni Suef',
        englishAreas: ['Beni Suef', 'Al Wasta', 'Nasser', 'Biba', 'Samasta', 'Al Fashn', 'Beni Suef City'],
        arabicAreas: ['بني سويف', 'الواسطى', 'ناصر', 'ببا', 'سمسطا', 'الفشن', 'مدينة بني سويف']
    },
    {
        name: 'Aswan',
        englishAreas: ['Aswan', 'Kom Ombo', 'Nasr Al Nuba', 'Edfu', 'Daraw', 'Abu Simbel', 'Al Radisiya', 'Sebaiya', 'Kalabsha'],
        arabicAreas: ['أسوان', 'كوم أمبو', 'نصر النوبة', 'إدفو', 'دراو', 'أبو سمبل', 'الراديسية', 'السباعية', 'كلابشة']
    },
    {
        name: 'Luxor',
        englishAreas: ['Luxor', 'Karnak', 'Thebes', 'New Tiba', 'New Gourna', 'Al Ziniya', 'Armant', 'Esna'],
        arabicAreas: ['الأقصر', 'الكرنك', 'طيبة', 'طيبة الجديدة', 'القرنة الجديدة', 'الزينية', 'أرمنت', 'إسنا']
    },
    {
        name: 'New Valley',
        englishAreas: ['Kharga', 'Dakhla', 'Farafra', 'Baris', 'Mut', 'Paris', 'Al Rashda'],
        arabicAreas: ['الخارجة', 'الداخلة', 'الفرافرة', 'باريس', 'موط', 'باريس', 'الرشيدة']
    },
    {
        name: 'Matrouh',
        englishAreas: ['Marsa Matrouh', 'El Alamein', 'Sidi Barrani', 'Siwa Oasis', 'El Negaila', 'Al Hamam', 'Al Dabaa'],
        arabicAreas: ['مرسى مطروح', 'العلمين', 'سيدي براني', 'واحة سيوة', 'النجيله', 'الحمام', 'الضبعة']
    },
    {
        name: 'Red Sea',
        englishAreas: ['Hurghada', 'El Gouna', 'Safaga', 'Quseir', 'Marsa Alam', 'Shalateen', 'Al Qusair', 'Ras Gharib'],
        arabicAreas: ['الغردقة', 'الجونة', 'سفاجا', 'القصير', 'مرسى علم', 'شلاتين', 'القصير', 'رأس غارب']
    },
    {
        name: 'North Sinai',
        englishAreas: ['Arish', 'Rafah', 'Sheikh Zuweid', 'Bir al-Abd', 'Al Hassana', 'Al Qantara', 'Nakhl'],
        arabicAreas: ['العريش', 'رفح', 'الشيخ زويد', 'بئر العبد', 'الحسنة', 'القنطرة', 'نخل']
    },
    {
        name: 'South Sinai',
        englishAreas: ['Sharm El Sheikh', 'Dahab', 'Nuweiba', 'Taba', 'Saint Catherine', 'Ras Sedr', 'Abu Redis'],
        arabicAreas: ['شرم الشيخ', 'دهب', 'نويبع', 'طابا', 'سانت كاترين', 'رأس سدر', 'أبو رديس']
    },
    {
        name: 'Port Said',
        englishAreas: ['Port Said', 'Port Fouad'],
        arabicAreas: ['بورسعيد', 'بور فؤاد']
    },
    {
        name: 'Suez',
        englishAreas: ['Suez', 'Al Ganayen', 'Al Arbaeen'],
        arabicAreas: ['السويس', 'الجناين', 'الأربعين']
    },
    {
        name: 'Damietta',
        englishAreas: ['Damietta', 'Ras El Bar', 'Faraskur', 'Kafr Saad', 'Ezbet El Borg', 'Kafr El Battikh', 'Al Zarqa'],
        arabicAreas: ['دمياط', 'رأس البر', 'فارسكور', 'كفر سعد', 'عزبة البرج', 'كفر البطيخ', 'الزرقا']
    },
    {
        name: 'Ismailia',
        englishAreas: ['Ismailia', 'Fayed', 'Qantara', 'Tell El Kebir', 'Abu Suwir', 'Al Qantara Sharq', 'Al Tal Al Kabir'],
        arabicAreas: ['الإسماعيلية', 'فايد', 'القنطرة', 'التل الكبير', 'أبو صوير', 'القنطرة شرق', 'التل الكبير']
    },
    {
        name: 'Kafr El Sheikh',
        englishAreas: ['Kafr El Sheikh', 'Desouk', 'Fuwwah', 'Baltim', 'Sidi Salim', 'Biyala', 'Al Hamool', 'Qallin', 'Metoubes', 'El Reyad'],
        arabicAreas: ['كفر الشيخ', 'دسوق', 'فوة', 'بلطيم', 'سيدي سالم', 'بيلا', 'الحامول', 'قلين', 'مطوبس', 'الرياض']
    }
]);

const SIDEUP_CITY_TRANSLATION_OVERRIDES = Object.freeze({
    'cairo and giza': 'القاهرة والجيزة',
    alexandria: 'الإسكندرية',
    dakahlia: 'الدقهلية',
    sharkia: 'الشرقية',
    qalyubia: 'القليوبية',
    beheira: 'البحيرة',
    gharbia: 'الغربية',
    monufia: 'المنوفية',
    minya: 'المنيا',
    assiut: 'أسيوط',
    sohag: 'سوهاج',
    qena: 'قنا',
    fayoum: 'الفيوم',
    'beni suef': 'بني سويف',
    aswan: 'أسوان',
    luxor: 'الأقصر',
    'new valley': 'الوادي الجديد',
    matrouh: 'مطروح',
    'red sea': 'البحر الأحمر',
    'north sinai': 'شمال سيناء',
    'south sinai': 'جنوب سيناء',
    'port said': 'بورسعيد',
    suez: 'السويس',
    damietta: 'دمياط',
    ismailia: 'الإسماعيلية',
    'kafr el sheikh': 'كفر الشيخ'
});

const SIDEUP_ZONE_TRANSLATIONS = Object.freeze({
    'cairo and giza': 'القاهرة والجيزة',
    'greater cairo': 'القاهرة الكبرى',
    'remote areas cairo': 'المناطق البعيدة بالقاهرة',
    alexandria: 'الإسكندرية',
    delta: 'الدلتا',
    canal: 'القناة',
    'central egypt': 'مصر الوسطى',
    'upper egypt': 'صعيد مصر',
    borders: 'المناطق الحدودية',
    'red sea': 'البحر الأحمر',
    redsea: 'البحر الأحمر',
    'delta remote areas': 'الدلتا والمناطق البعيدة'
});

const SIDEUP_AREA_TRANSLATION_OVERRIDES = Object.freeze({
    alexandria: 'الإسكندرية',
    '15 of may city': 'مدينة 15 مايو',
    '5th settlement': 'التجمع الخامس',
    '6th of october city': 'السادس من أكتوبر',
    abbaseya: 'العباسية',
    abbassia: 'العباسية',
    'ain shams': 'عين شمس',
    'al ayat': 'العياط',
    'al badrashin': 'البدراشين',
    'al mataria': 'المطرية',
    'al matariyyah': 'المطرية',
    'al omraniya': 'العمرانية',
    'ausim giza': 'أوسيم',
    ausim: 'أوسيم',
    'bolak al dakrur': 'بولاق الدكرور',
    damanhour: 'دمنهور',
    dumiatta: 'دمياط',
    'el manyal': 'المنيل',
    'el saff': 'الصف',
    'el salam city': 'مدينة السلام',
    'el hawamdeyya': 'الحوامدية',
    'el marg': 'المرج',
    elwadielgedid: 'الوادي الجديد',
    'elwadi elgedid': 'الوادي الجديد',
    elwahat: 'الواحات',
    faisal: 'فيصل',
    'gesr al suez': 'جسر السويس',
    'hadayek el ahram': 'حدائق الأهرام',
    helwan: 'حلوان',
    imbaba: 'إمبابة',
    madinaty: 'مدينتي',
    mohandeseen: 'المهندسين',
    mohandessin: 'المهندسين',
    mokatam: 'المقطم',
    'new administrative capital': 'العاصمة الإدارية الجديدة',
    omraniya: 'العمرانية',
    rehab: 'الرحاب',
    'rehab city': 'الرحاب',
    'shebin el koum': 'شبين الكوم',
    'sherouk city': 'الشروق',
    'el shorouk': 'الشروق',
    '6th of october': 'السادس من أكتوبر',
    'new cairo': 'القاهرة الجديدة',
    'new giza': 'نيو جيزة',
    qalyubia: 'القليوبية',
    'el obour city': 'مدينة العبور',
    'obour city': 'مدينة العبور',
    'smart village': 'القرية الذكية',
    'new capital': 'العاصمة الإدارية الجديدة'
});

function buildAreaTranslationLookup() {
    const lookup = new Map();

    SIDEUP_TRANSLATION_GROUPS.forEach((group) => {
        group.englishAreas.forEach((englishArea, index) => {
            const arabicArea = group.arabicAreas[index];
            if (!englishArea || !arabicArea) {
                return;
            }

            lookup.set(normalizeSideUpTranslationKey(englishArea), arabicArea);
        });
    });

    Object.entries(SIDEUP_AREA_TRANSLATION_OVERRIDES).forEach(([englishArea, arabicArea]) => {
        lookup.set(normalizeSideUpTranslationKey(englishArea), arabicArea);
    });

    return lookup;
}

const SIDEUP_AREA_TRANSLATIONS = buildAreaTranslationLookup();

function getTranslatedValue(lookup, value) {
    const normalizedValue = normalizeSideUpTranslationKey(value);
    if (!normalizedValue) {
        return '';
    }

    return lookup instanceof Map
        ? (lookup.get(normalizedValue) || '')
        : (lookup[normalizedValue] || '');
}

function getFallbackCityTranslation(value) {
    const normalizedValue = normalizeSideUpTranslationKey(value);

    if (normalizedValue.includes('cairo') && normalizedValue.includes('giza')) {
        return 'القاهرة والجيزة';
    }

    if (normalizedValue.includes('alex')) {
        return 'الإسكندرية';
    }

    return '';
}

function getFallbackZoneTranslation(value) {
    const normalizedValue = normalizeSideUpTranslationKey(value);

    if (normalizedValue.includes('greater') && normalizedValue.includes('cairo')) {
        return 'القاهرة الكبرى';
    }

    if (normalizedValue.includes('remote') && normalizedValue.includes('cairo')) {
        return 'المناطق البعيدة بالقاهرة';
    }

    if (normalizedValue.includes('delta')) {
        return 'الدلتا';
    }

    if (normalizedValue.includes('border')) {
        return 'المناطق الحدودية';
    }

    return '';
}

export function getTranslatedSideUpAreaName(value) {
    return getTranslatedValue(SIDEUP_AREA_TRANSLATIONS, value);
}

export function getTranslatedSideUpCityName(value) {
    return getTranslatedValue(SIDEUP_CITY_TRANSLATION_OVERRIDES, value) || getFallbackCityTranslation(value);
}

export function getTranslatedSideUpZoneName(value) {
    return getTranslatedValue(SIDEUP_ZONE_TRANSLATIONS, value) || getFallbackZoneTranslation(value);
}
