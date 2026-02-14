// Kahoot-style avatar presets - fun character icons
export const AVATAR_PRESETS = [
  { id: 'fox', emoji: '🦊', name: 'Fox', color: '#FF6B35' },
  { id: 'panda', emoji: '🐼', name: 'Panda', color: '#2D3436' },
  { id: 'unicorn', emoji: '🦄', name: 'Unicorn', color: '#A855F7' },
  { id: 'dragon', emoji: '🐉', name: 'Dragon', color: '#22C55E' },
  { id: 'owl', emoji: '🦉', name: 'Owl', color: '#8B5CF6' },
  { id: 'lion', emoji: '🦁', name: 'Lion', color: '#F59E0B' },
  { id: 'cat', emoji: '🐱', name: 'Cat', color: '#EC4899' },
  { id: 'dog', emoji: '🐶', name: 'Dog', color: '#3B82F6' },
  { id: 'rabbit', emoji: '🐰', name: 'Rabbit', color: '#F472B6' },
  { id: 'bear', emoji: '🐻', name: 'Bear', color: '#92400E' },
  { id: 'koala', emoji: '🐨', name: 'Koala', color: '#6B7280' },
  { id: 'penguin', emoji: '🐧', name: 'Penguin', color: '#1E3A5F' },
  { id: 'tiger', emoji: '🐯', name: 'Tiger', color: '#EA580C' },
  { id: 'monkey', emoji: '🐵', name: 'Monkey', color: '#A16207' },
  { id: 'frog', emoji: '🐸', name: 'Frog', color: '#16A34A' },
  { id: 'octopus', emoji: '🐙', name: 'Octopus', color: '#DB2777' },
  { id: 'butterfly', emoji: '🦋', name: 'Butterfly', color: '#0EA5E9' },
  { id: 'bee', emoji: '🐝', name: 'Bee', color: '#EAB308' },
  { id: 'robot', emoji: '🤖', name: 'Robot', color: '#64748B' },
  { id: 'alien', emoji: '👽', name: 'Alien', color: '#10B981' },
  { id: 'superhero', emoji: '🦸', name: 'Hero', color: '#EF4444' },
  { id: 'wizard', emoji: '🧙', name: 'Wizard', color: '#7C3AED' },
  { id: 'astronaut', emoji: '👨‍🚀', name: 'Astronaut', color: '#0284C7' },
  { id: 'ninja', emoji: '🥷', name: 'Ninja', color: '#1F2937' },
];

// Get avatar by ID
export const getAvatarById = (id) => {
  return AVATAR_PRESETS.find(a => a.id === id) || AVATAR_PRESETS[0];
};

// Get random avatar
export const getRandomAvatar = () => {
  return AVATAR_PRESETS[Math.floor(Math.random() * AVATAR_PRESETS.length)];
};
