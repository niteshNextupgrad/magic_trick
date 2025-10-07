import React, { useEffect } from 'react';

const deepgramNova3Languages = [
    { code: 'en', label: 'English' },
    { code: 'en-US', label: 'English (US)' },
    { code: 'en-GB', label: 'English (UK)' },
    { code: 'en-IN', label: 'English (India)' },
    { code: 'en-AU', label: 'English (Australia)' },
    { code: 'en-NZ', label: 'English (New Zealand)' },
    { code: 'es', label: 'Spanish' },
    { code: 'es-419', label: 'Spanish (Latin America)' },
    { code: 'fr', label: 'French' },
    { code: 'fr-CA', label: 'French (Canada)' },
    { code: 'de', label: 'German' },
    { code: 'it', label: 'Italian' },
    { code: 'pt', label: 'Portuguese' },
    { code: 'pt-BR', label: 'Portuguese (Brazil)' },
    { code: 'pt-PT', label: 'Portuguese (Portugal)' },
    { code: 'nl', label: 'Dutch' },
    { code: 'sv', label: 'Swedish' },
    { code: 'sv-SE', label: 'Swedish (Sweden)' },
    { code: 'da', label: 'Danish' },
    { code: 'da-DK', label: 'Danish (Denmark)' },
    { code: 'no', label: 'Norwegian' },
    { code: 'id', label: 'Indonesian' },
    { code: 'tr', label: 'Turkish' },
];

const SelectLanguage = ({ value, onChange, isListening }) => {

    return (
        <div className="language_select">
            <label>Language: </label>
            <select
                className="form-select"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                disabled={isListening}
            >
                {deepgramNova3Languages.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                        {lang.label}
                    </option>
                ))}
            </select>
        </div>
    );
};

export default SelectLanguage;
