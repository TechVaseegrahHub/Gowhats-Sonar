export const COUNTRIES = [
  { code: 'IN', dialCode: '91', name: 'India', flag: '🇮🇳' },
  { code: 'US', dialCode: '1', name: 'United States', flag: '🇺🇸' },
  { code: 'GB', dialCode: '44', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'AE', dialCode: '971', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'SG', dialCode: '65', name: 'Singapore', flag: '🇸🇬' },
  { code: 'AU', dialCode: '61', name: 'Australia', flag: '🇦🇺' },
  { code: 'CA', dialCode: '1', name: 'Canada', flag: '🇨🇦' },
  { code: 'DE', dialCode: '49', name: 'Germany', flag: '🇩🇪' },
  { code: 'FR', dialCode: '33', name: 'France', flag: '🇫🇷' },
  { code: 'IT', dialCode: '39', name: 'Italy', flag: '🇮🇹' },
  { code: 'ES', dialCode: '34', name: 'Spain', flag: '🇪🇸' },
  { code: 'BR', dialCode: '55', name: 'Brazil', flag: '🇧🇷' },
  { code: 'MX', dialCode: '52', name: 'Mexico', flag: '🇲🇽' },
  { code: 'ZA', dialCode: '27', name: 'South Africa', flag: '🇿🇦' },
  { code: 'NG', dialCode: '234', name: 'Nigeria', flag: '🇳🇬' },
  { code: 'KE', dialCode: '254', name: 'Kenya', flag: '🇰🇪' },
  { code: 'PK', dialCode: '92', name: 'Pakistan', flag: '🇵🇰' },
  { code: 'BD', dialCode: '880', name: 'Bangladesh', flag: '🇧🇩' },
  { code: 'LK', dialCode: '94', name: 'Sri Lanka', flag: '🇱🇰' },
  { code: 'NP', dialCode: '977', name: 'Nepal', flag: '🇳🇵' },
  { code: 'ID', dialCode: '62', name: 'Indonesia', flag: '🇮🇩' },
  { code: 'PH', dialCode: '63', name: 'Philippines', flag: '🇵🇭' },
  { code: 'MY', dialCode: '60', name: 'Malaysia', flag: '🇲🇾' },
  { code: 'TH', dialCode: '66', name: 'Thailand', flag: '🇹🇭' },
  { code: 'VN', dialCode: '84', name: 'Vietnam', flag: '🇻🇳' },
  { code: 'SA', dialCode: '966', name: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'TR', dialCode: '90', name: 'Turkey', flag: '🇹🇷' },
  { code: 'RU', dialCode: '7', name: 'Russia', flag: '🇷🇺' },
  { code: 'JP', dialCode: '81', name: 'Japan', flag: '🇯🇵' },
  { code: 'KR', dialCode: '82', flag: '🇰🇷' }
];

export const findCountryByCode = (code) =>
  COUNTRIES.find(c => c.code === code) || COUNTRIES[0];

export const defaultCountry = 'IN';
