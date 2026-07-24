export const HAIR_PROFILE_FIELDS = [
    'longueur',
    'densite',
    'texture',
    'etat_actuel',
    'naturel_defrise',
    'traitements_chimiques',
    'sensibilite_cuir_chevelu',
    'extensions',
    'preferences_allergies',
    'photos'
];

const FIELD_SET = new Set(HAIR_PROFILE_FIELDS);

export const parseHairProfileFields = (value) => {
    if (value === undefined || value === null || value === '') return [];
    const values = Array.isArray(value) ? value : String(value).split(',');
    return [...new Set(values.map((item) => String(item).trim()).filter((item) => FIELD_SET.has(item)))];
};

export const areHairProfileFieldsValid = (value) => {
    if (value === undefined || value === null || value === '') return true;
    const values = Array.isArray(value) ? value : String(value).split(',');
    return values.every((item) => FIELD_SET.has(String(item).trim()));
};
