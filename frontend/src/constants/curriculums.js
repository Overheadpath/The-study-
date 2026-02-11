// Supported curriculums worldwide
export const CURRICULUMS = [
  {
    id: "caps",
    name: "CAPS",
    country: "South Africa",
    flag: "🇿🇦",
    grades: "Grade 1-12",
    description: "Curriculum and Assessment Policy Statement"
  },
  {
    id: "common_core",
    name: "Common Core",
    country: "United States",
    flag: "🇺🇸",
    grades: "K-12",
    description: "US Common Core State Standards"
  },
  {
    id: "uk_national",
    name: "National Curriculum",
    country: "United Kingdom",
    flag: "🇬🇧",
    grades: "Year 1-13",
    description: "UK National Curriculum"
  },
  {
    id: "australian",
    name: "Australian Curriculum",
    country: "Australia",
    flag: "🇦🇺",
    grades: "Foundation-Year 12",
    description: "Australian National Curriculum"
  },
  {
    id: "cbse",
    name: "CBSE",
    country: "India",
    flag: "🇮🇳",
    grades: "Class 1-12",
    description: "Central Board of Secondary Education"
  },
  {
    id: "cambridge",
    name: "Cambridge International",
    country: "International",
    flag: "🌍",
    grades: "Primary-A Level",
    description: "Cambridge Assessment International Education"
  },
  {
    id: "ib",
    name: "IB Programme",
    country: "International",
    flag: "🌍",
    grades: "PYP, MYP, DP",
    description: "International Baccalaureate"
  },
  {
    id: "canadian",
    name: "Canadian Curriculum",
    country: "Canada",
    flag: "🇨🇦",
    grades: "K-12",
    description: "Provincial Education Standards"
  },
  {
    id: "german",
    name: "German System",
    country: "Germany",
    flag: "🇩🇪",
    grades: "Klasse 1-13",
    description: "German Educational Standards"
  },
  {
    id: "french",
    name: "French Curriculum",
    country: "France",
    flag: "🇫🇷",
    grades: "CP-Terminale",
    description: "French National Education"
  },
  {
    id: "other",
    name: "Other / General",
    country: "Worldwide",
    flag: "🌐",
    grades: "All levels",
    description: "General educational support"
  }
];

// Get curriculum by ID
export const getCurriculum = (id) => {
  return CURRICULUMS.find(c => c.id === id) || CURRICULUMS[CURRICULUMS.length - 1];
};

// Get subjects based on curriculum and grade
export const getSubjects = (curriculumId, grade) => {
  // Common subjects across all curriculums
  const commonSubjects = [
    "Mathematics",
    "Science",
    "English",
    "Reading",
    "Writing"
  ];
  
  // Curriculum-specific subjects
  const curriculumSubjects = {
    caps: ["Afrikaans", "Life Skills", "Social Sciences", "Technology", "Economic Management Sciences"],
    common_core: ["Social Studies", "Art", "Music", "Physical Education"],
    uk_national: ["History", "Geography", "Computing", "Design & Technology", "Languages"],
    australian: ["HASS", "Technologies", "Health & PE", "The Arts"],
    cbse: ["Hindi", "Social Science", "Computer Science", "Environmental Studies"],
    cambridge: ["Global Perspectives", "Computer Science", "Business Studies"],
    ib: ["TOK", "Extended Essay", "CAS", "World Languages"],
    canadian: ["French", "Social Studies", "Health", "Arts"],
    german: ["Deutsch", "Geschichte", "Erdkunde", "Informatik"],
    french: ["Français", "Histoire-Géographie", "Technologie", "Arts plastiques"],
    other: ["General Studies", "Critical Thinking"]
  };
  
  return [...commonSubjects, ...(curriculumSubjects[curriculumId] || curriculumSubjects.other)];
};
