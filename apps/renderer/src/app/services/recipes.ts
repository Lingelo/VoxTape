export interface Recipe {
  command: string;
  label: string;
  prompt: string;
}

export const RECIPES: Recipe[] = [
  {
    command: '/resume',
    label: 'Résumé',
    prompt: 'Résume cette réunion en bullet points concis. Adapte le nombre de points à la longueur de la réunion. N\'invente rien.',
  },
  {
    command: '/actions',
    label: 'Points d\'action',
    prompt: 'Liste les action items décidés pendant cette réunion, avec le responsable si mentionné. S\'il n\'y en a pas, dis-le.',
  },
  {
    command: '/decisions',
    label: 'Décisions prises',
    prompt: 'Liste les décisions prises pendant cette réunion. S\'il n\'y en a pas, dis-le.',
  },
  {
    command: '/email',
    label: 'E-mail de suivi',
    prompt: 'Rédige un e-mail de suivi professionnel basé uniquement sur le contenu de cette réunion. N\'invente aucun détail.',
  },
  {
    command: '/questions',
    label: 'Questions ouvertes',
    prompt: 'Quelles questions restent ouvertes ou non résolues après cette réunion ? S\'il n\'y en a pas, dis-le.',
  },
];
