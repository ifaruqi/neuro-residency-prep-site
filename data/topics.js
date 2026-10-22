// Topic list. w = weight per 100 try-out questions; past = count in the 6 past papers (docs/topic-map.md).
window.TOPICS = [
  { id: 'E', name: 'Saraf Kranial & Neuro-oftalmologi', w: 14, past: 64 },
  { id: 'I', name: 'Serebrovaskular (Stroke)', w: 11, past: 49 },
  { id: 'N', name: 'Neurobehavior: Memori, Bahasa, Atensi, Emosi', w: 9, past: 43 },
  { id: 'K', name: 'Neurotrauma & Tekanan Intrakranial', w: 7, past: 34 },
  { id: 'C', name: 'Jaras Sensorik-Motorik & Nyeri', w: 7, past: 31 },
  { id: 'O', name: 'Neuromuskular & Saraf Tepi', w: 7, past: 31 },
  { id: 'A', name: 'Neuroanatomi Dasar', w: 6, past: 28 },
  { id: 'L', name: 'Epilepsi & Kejang', w: 6, past: 28 },
  { id: 'G', name: 'Ganglia Basalis & Gangguan Gerak', w: 6, past: 26 },
  { id: 'D', name: 'Medula Spinalis & Radiks', w: 5, past: 23 },
  { id: 'H', name: 'Vestibular & Vertigo', w: 5, past: 21 },
  { id: 'J', name: 'Kesadaran & Koma', w: 4, past: 17 },
  { id: 'M', name: 'Nyeri Kepala & Nyeri Wajah', w: 4, past: 17 },
  { id: 'F', name: 'Serebelum', w: 3, past: 16 },
  { id: 'B', name: 'Neurotransmiter & Neurofisiologi', w: 2, past: 11 },
  { id: 'P', name: 'Neuroinfeksi & LCS', w: 2, past: 11 },
  { id: 'Q', name: 'Neuro-onkologi', w: 2, past: 8 }
];

// Question bank. Q(topic, stem, options, explanation, source)
// options[0] is ALWAYS the correct answer; the app shuffles at render time.
window.QB = [];
window.Q = function (t, q, o, e, src) {
  window.QB.push({ t: t, q: q, o: o, e: e, src: src || 'AI' });
};
