import type { BoxId, Lang } from '../types'

/**
 * One line per string, both languages side by side, so a translation can
 * never silently go missing — TypeScript requires every key to hold every
 * `Lang`. Adding a language is one widening of `Lang` plus this file.
 *
 * `{0}`, `{1}` … are positional placeholders filled by `t(...)`.
 */
const S = {
  appName: { te: 'చిల్-బాక్స్', en: 'Chill-Box' },

  tabDock: { te: 'బుకింగ్', en: 'Book' },
  tabHarbour: { te: 'హార్బర్', en: 'Harbour' },

  day: { te: 'పగలు', en: 'Day' },
  night: { te: 'రాత్రి', en: 'Night' },
  cancel: { te: 'రద్దు', en: 'Cancel' },
  resetDemo: { te: 'డెమో రీసెట్', en: 'Reset demo' },
  demoTitle: { te: 'డెమో సాధనాలు', en: 'Demo tools' },
  demoBody: { te: 'ఇవి చూపించడానికి మాత్రమే. నిజ వాడకంలో ఇవి ఉండవు.', en: 'For demonstration only. These do not appear in real use.' },
  demoSimulateOn: { te: 'సముద్రంలో 8 km దూరంలో ఉన్నట్టు చూపు', en: 'Pretend I am 8 km out at sea' },
  demoSimulateOff: { te: 'నిజ GPS కి తిరిగి వెళ్లు', en: 'Back to real GPS' },
  demoSimulateHint: { te: 'రేవులో కూర్చునే దారి, దూరం, దిక్సూచి ఎలా పని చేస్తాయో చూడటానికి.', en: 'Shows how the route, distance and compass work without going to sea.' },

  // — Registration ————————————————————————————————
  regTitle: { te: 'మీ బోటును నమోదు చేయండి', en: 'Register your boat' },
  regIntro: { te: 'ఒక్కసారి మాత్రమే. తర్వాత పాస్‌వర్డ్ అక్కర్లేదు.', en: 'Once only. No password after this.' },
  regBoatName: { te: 'బోటు పేరు', en: 'Boat name' },
  regOwner: { te: 'యజమాని పేరు', en: 'Owner name' },
  regMobile: { te: 'మొబైల్ నంబర్', en: 'Mobile number' },
  regSubmit: { te: 'నమోదు చేయి', en: 'Register' },
  claimTitle: { te: '{0} — మీ నంబర్ చివరి 4 అంకెలు', en: '{0} — last 4 digits of your mobile' },
  claimBody: { te: 'ఇది మీ బోటు అని నిర్ధారించడానికి.', en: 'Just to confirm this boat is yours.' },
  claimWrong: { te: 'నంబర్ సరిపోలలేదు', en: 'That does not match' },
  claimGo: { te: 'కొనసాగించు', en: 'Continue' },
  regExisting: { te: 'ఇప్పటికే నమోదైన బోటు', en: 'Already registered boat' },
  errBoatName: { te: 'బోటు పేరు రాయండి', en: 'Enter the boat name' },
  errOwner: { te: 'యజమాని పేరు రాయండి', en: 'Enter the owner name' },
  errMobile: { te: '10 అంకెల మొబైల్ నంబర్ రాయండి', en: 'Enter a 10-digit mobile number' },
  errMobileTaken: { te: 'ఈ నంబర్ ఇప్పటికే నమోదైంది', en: 'That number is already registered' },

  pendingTitle: { te: 'అడ్మిన్ ఆమోదం కోసం వేచి ఉంది', en: 'Waiting for admin approval' },
  pendingBody: { te: 'హార్బర్ అడ్మిన్ ఆమోదించగానే మీరు బాక్స్ బుక్ చేయవచ్చు. ఇప్పటికీ అందరి స్థలం చూడవచ్చు.', en: 'You can book a box the moment the harbour admin approves you. Until then you can still watch every box.' },
  blockedTitle: { te: 'మీ బోటు ఆపబడింది', en: 'Your boat is on hold' },
  blockedBody: { te: 'హార్బర్ అడ్మిన్‌ను సంప్రదించండి.', en: 'Please speak to the harbour admin.' },
  signOut: { te: 'బోటు మార్చు', en: 'Switch boat' },

  // — Dock ————————————————————————————————————————
  legendFree: { te: 'ఖాళీ', en: 'Free' },
  legendHold: { te: 'హోల్డ్', en: 'Hold' },
  legendFull: { te: 'నిండింది', en: 'Full' },
  legendLate: { te: 'ఆలస్యం', en: 'Late' },
  full: { te: 'నిండింది', en: 'FULL' },
  crates: { te: 'క్రేట్లు', en: 'crates' },
  freeCrates: { te: '{0} ఖాళీ', en: '{0} free' },
  suggested: { te: 'ఎక్కువ ఖాళీ', en: 'Most room' },
  quotaLeft: { te: 'మీకు ఇంకా {0} క్రేట్లు', en: '{0} crates left for you' },

  pickTitle: { te: 'ఏ బాక్స్ కావాలి?', en: 'Which box do you want?' },
  cratesTitle: { te: 'ఎన్ని క్రేట్లు?', en: 'How many crates?' },
  crate1: { te: '1 క్రేట్', en: '1 crate' },
  crate2: { te: '2 క్రేట్లు', en: '2 crates' },
  bookIn: { te: '{0} లో బుక్ చేయి', en: 'Book in {0}' },

  holdTitle: { te: 'హోల్డ్ యాక్టివ్', en: 'Hold active' },
  holdBody: { te: '{0}లో {1} క్రేట్లు మీ పేరున ఉన్నాయి.', en: '{1} crate(s) held for you in {0}.' },
  holdLeft: { te: 'మిగిలిన సమయం', en: 'Time left' },
  deposited: { te: 'చేపలు పెట్టాను', en: 'Fish deposited' },
  cancelHold: { te: 'హోల్డ్ రద్దు', en: 'Cancel hold' },

  planTitle: { te: 'ఎప్పుడు తీసుకెళ్తారు?', en: 'When will you collect?' },
  planBody: { te: 'ఈ సమయం అందరికీ కనిపిస్తుంది — వాళ్లు ప్లాన్ చేసుకుంటారు.', en: 'Everyone sees this time and plans around it.' },
  planHours: { te: '{0} గంటల్లో', en: 'In {0} h' },

  storedTitle: { te: 'మీ చేపలు భద్రంగా ఉన్నాయి', en: 'Your fish are secured' },
  storedIn: { te: '{0} · {1} క్రేట్లు', en: '{0} · {1} crate(s)' },
  since: { te: 'పెట్టినది', en: 'Stored' },
  planned: { te: 'తీసుకెళ్లే సమయం', en: 'Collect by' },
  release: { te: 'అమ్మకం అయింది — ఖాళీ చేశాను', en: 'Sold — release the slot' },
  lateTitle: { te: '6 గంటలు దాటింది — స్థలం ఖాళీ చేయండి', en: 'Past 6 hours — please clear the slot' },
  lateBody: { te: 'జరిమానా లేదు. హార్బర్ అంతా ఈ ఆలస్యాన్ని చూస్తోంది.', en: 'No fine. The whole harbour can see this delay.' },

  // — Boxes ———————————————————————————————————————
  box1: { te: 'వేలం హాలు బాక్స్', en: 'Auction Hall box' },
  box1Place: { te: 'ఉత్తర జెట్టీ', en: 'North quay' },
  box2: { te: 'ఐస్ ప్లాంట్ బాక్స్', en: 'Ice Plant box' },
  box2Place: { te: 'దక్షిణ జెట్టీ', en: 'South quay' },
  box3: { te: 'డీజిల్ బంక్ బాక్స్', en: 'Diesel Bunk box' },
  box3Place: { te: 'తూర్పు జెట్టీ', en: 'East quay' },
  // Short forms for the chart, where a long label covers its neighbour.
  box1Short: { te: 'వేలం హాలు', en: 'Auction' },
  box2Short: { te: 'ఐస్ ప్లాంట్', en: 'Ice plant' },
  box3Short: { te: 'డీజిల్ బంక్', en: 'Diesel' },

  // — Sea state ———————————————————————————————————
  waveCalm: { te: 'ప్రశాంతం', en: 'Calm' },
  waveModerate: { te: 'సాధారణ అలలు', en: 'Moderate swell' },
  waveRough: { te: 'ప్రమాదకర అలలు', en: 'Rough breakers' },
  waveCalmHint: { te: 'సురక్షిత ల్యాండింగ్', en: 'Safe landing' },
  waveModerateHint: { te: 'జాగ్రత్తగా రండి', en: 'Come in careful' },
  waveRoughHint: { te: 'ల్యాండింగ్‌లో జాగ్రత్త', en: 'Caution on landing' },
  waveLoading: { te: 'అలల సమాచారం…', en: 'Fetching swell…' },
  waveError: { te: 'అలల సమాచారం లేదు', en: 'Swell data offline' },

  // — Navigation ——————————————————————————————————
  navTitle: { te: 'దగ్గరలోని కోల్డ్ బాక్సులు', en: 'Cold boxes near you' },
  navTapMap: { te: 'మ్యాప్‌లో బాక్స్ మీద నొక్కి బుక్ చేయండి.', en: 'Tap a box on the map to book it.' },
  // — Harbour & union ————————————————————————————————
  harbourSwitch: { te: 'హార్బర్ మార్చు', en: 'Change harbour' },
  harbourChoose: { te: 'మీ హార్బర్ ఎంచుకోండి', en: 'Choose your harbour' },


  // — Safety ——————————————————————————————————————
  safetyTitle: { te: 'ల్యాండింగ్ భద్రత', en: 'Landing safety' },
  safetyRough: { te: 'అలలు ప్రమాదకరంగా ఉన్నాయి. ల్యాండింగ్ ఆలస్యం చేయండి.', en: 'Breakers are dangerous. Delay your landing.' },
  safetyStepWait: { te: 'ముఖద్వారం వద్ద ఆగి, అలల వరుస చూడండి — పెద్ద అల తర్వాత లోపలికి రండి.', en: 'Hold off the mouth, watch the wave sets, and come in behind a big one.' },
  safetyStepLife: { te: 'లైఫ్ జాకెట్లు వేసుకోండి. డెక్ మీద ఉన్నవన్నీ కట్టేయండి.', en: 'Life jackets on. Lash everything loose on deck.' },
  safetyStepCall: { te: 'ఇబ్బంది ఉంటే వెంటనే ఫోన్ చేయండి — ఆలస్యం చేయకండి.', en: 'In trouble, call straight away — do not wait it out.' },
  safetyCalm: { te: 'అలలు ప్రశాంతంగా ఉన్నాయి. అయినా నంబర్లు ఇక్కడే ఉన్నాయి.', en: 'Conditions are calm. The numbers stay here anyway.' },
  emergency: { te: 'అత్యవసర నంబర్లు', en: 'Emergency numbers' },
  emCoastGuard: { te: 'కోస్ట్ గార్డ్ (సముద్ర ప్రమాదం)', en: 'Coast Guard (marine distress)' },
  emAll: { te: 'అన్ని అత్యవసరాలు', en: 'All emergencies' },
  emAmbulance: { te: 'అంబులెన్స్', en: 'Ambulance' },
  emDisaster: { te: 'జిల్లా విపత్తు నియంత్రణ', en: 'District disaster control' },
  emOffice: { te: 'హార్బర్ ఆఫీస్', en: 'Harbour office' },
  callNow: { te: 'ఫోన్ చేయి', en: 'Call' },
  saveNumbers: { te: 'నంబర్లు ఫోన్‌లో సేవ్ చేయి', en: 'Save numbers to phone' },
  shareLocation: { te: 'నా లొకేషన్ పంపు', en: 'Send my location' },
  lastFix: { te: 'లొకేషన్ సమయం {0}', en: 'Position taken {0}' },
  fixStale: { te: 'ఈ లొకేషన్ {0} నాటిది — కదిలి ఉంటే మళ్లీ చూడండి', en: 'This position is {0} old — check again if you have moved' },
  noFix: { te: 'లొకేషన్ ఇంకా రాలేదు', en: 'No location fix yet' },
  contactsSaved: { te: 'నంబర్ల ఫైల్ డౌన్‌లోడ్ అయింది — తెరిచి సేవ్ చేయండి', en: 'Contacts file downloaded — open it to save' },


  // — Booking confirmation ————————————————————————
  bookedTitle: { te: 'బుకింగ్ ఖాయమైంది', en: 'Booking confirmed' },
  bookedCode: { te: 'బాక్స్ దగ్గర ఈ కోడ్ చూపించండి', en: 'Show this code at the box' },
  bookedBy: { te: '{0} లోపు చేపలు పెట్టండి', en: 'Deposit before {0}' },
  ok: { te: 'సరే', en: 'OK' },

  // — No GPS ——————————————————————————————————————
  noGpsTitle: { te: 'GPS లేదు? పర్వాలేదు.', en: 'No GPS? No problem.' },
  noGpsBody: { te: 'కింద ఉన్న పేర్ల నుంచి బాక్స్ ఎంచుకోండి. బుకింగ్‌కు GPS అవసరం లేదు.', en: 'Pick your box by name from the list below. Booking never needs GPS.' },

  lmOffice: { te: 'హార్బర్ ఆఫీస్', en: 'Harbour office' },
  navDistance: { te: 'దూరం', en: 'Distance' },
  navEta: { te: 'చేరే సమయం', en: 'ETA' },
  navBearing: { te: 'దిక్కు', en: 'Bearing' },
  navAtBox: { te: 'బాక్స్ చేరుకున్నారు', en: 'You are at the box' },
  navSimulate: { te: '8 km అనుకరణ', en: 'Simulate 8 km out' },
  navLive: { te: 'నిజ GPS', en: 'Live GPS' },
  navMapNote: { te: 'ఉచిత OpenStreetMap + OpenSeaMap. ఖాతా అవసరం లేదు.', en: 'Free OpenStreetMap + OpenSeaMap. No account needed.' },
  navOffline: { te: 'మ్యాప్ లోడ్ కాలేదు — దిక్సూచి పని చేస్తోంది.', en: 'Map tiles unavailable — the compass still works.' },
  boxAway: { te: '{0} దూరం', en: '{0} away' },
  offlineTitle: { te: 'నెట్ లేదు', en: 'No signal' },
  syncOffline: { te: 'నెట్ లేకుండా బుక్ చేయలేము. సిగ్నల్ వచ్చాక మళ్లీ చూడండి.', en: 'Cannot book without a signal. Try again when you have one.' },
  syncLive: { te: 'అన్ని ఫోన్లలో ఒకటే', en: 'Shared live' },
  storageFull: { te: 'ఫోన్ మెమరీ నిండింది — కొత్త మార్పులు సేవ్ కావట్లేదు. బాక్స్ దగ్గర ఒకసారి చెప్పండి.', en: 'Phone storage is full — changes are not being saved. Tell someone at the box.' },
  staleNever: { te: 'ఈ సంఖ్యలు ఈ ఫోన్‌లోనివి మాత్రమే. బాక్స్ దగ్గర ఒకసారి చూసుకోండి.', en: 'These figures are from this phone only. Check again at the box.' },
  staleBody: { te: 'ఈ సంఖ్యలు {0} నాటివి. బాక్స్ దగ్గర ఒకసారి చూసుకోండి.', en: 'These figures are from {0}. Check again at the box.' },
  errNotApproved: { te: 'అడ్మిన్ ఆమోదం వచ్చాకే బుక్ చేయగలరు.', en: 'You can book once the admin approves your boat.' },
  errQuota: { te: 'ఒక్క బోటుకి {0} క్రేట్లు మాత్రమే. మీకు ఇంకా {1} మిగిలింది.', en: 'Max {0} crates per boat. You have {1} left.' },
  holdExpired: { te: '4 గంటల హోల్డ్ ముగిసింది. స్థలం తిరిగి పూల్‌లోకి వెళ్లింది.', en: 'The 4-hour hold ended. That slot is back in the pool.' },
  raceLost: { te: 'ఈలోపు ఆ స్థలం వేరే బోటు తీసుకుంది. మరో బాక్స్ చూడండి.', en: 'Another boat took that space just now. Try another box.' },

  // — Harbour list ————————————————————————————————
  harbourTitle: { te: 'ఏ బాక్స్‌లో ఎవరు', en: 'Who is in which box' },
  harbourBody: { te: 'తొందరగా ఖాళీ అయ్యేవి ముందు.', en: 'Soonest to free up, first.' },
  nothingStored: { te: 'ఇప్పుడు ఏ బోటూ నిల్వ చేయలేదు.', en: 'No boat is storing anything right now.' },
  outIn: { te: 'ఖాళీ అవుతుంది', en: 'Frees up' },
  noPlan: { te: 'సమయం చెప్పలేదు', en: 'No time given' },
  boatsTitle: { te: 'హార్బర్ బోట్లు', en: 'Harbour boats' },
  boatsCount: { te: '{0} బోట్లు', en: '{0} boats' },
  statusActive: { te: 'ఆమోదం', en: 'Approved' },
  statusPending: { te: 'వేచి ఉంది', en: 'Pending' },
  statusBlocked: { te: 'ఆపబడింది', en: 'Blocked' },
  storingNow: { te: 'నిల్వలో', en: 'Storing' },
  idle: { te: 'ఖాళీ', en: 'Idle' },

  // — Admin ———————————————————————————————————————
  adminTitle: { te: 'హార్బర్ అడ్మిన్', en: 'Harbour admin' },
  adminPinLabel: { te: 'అడ్మిన్ పిన్', en: 'Admin PIN' },
  adminUnlock: { te: 'తెరవండి', en: 'Unlock' },
  adminWrongPin: { te: 'పిన్ తప్పు', en: 'Wrong PIN' },
  adminLock: { te: 'మూసివేయి', en: 'Lock' },
  adminApprovals: { te: 'ఆమోదం కోసం', en: 'Waiting for approval' },
  adminNoApprovals: { te: 'పెండింగ్ ఏమీ లేదు.', en: 'Nothing pending.' },
  approve: { te: 'ఆమోదించు', en: 'Approve' },
  reject: { te: 'తిరస్కరించు', en: 'Reject' },
  block: { te: 'ఆపు', en: 'Block' },
  unblock: { te: 'తిరిగి ఇవ్వు', en: 'Restore' },
  adminLive: { te: 'ప్రస్తుత వాడకం', en: 'Live usage' },
  adminForceRelease: { te: 'బలవంతంగా ఖాళీ', en: 'Force release' },
  adminMonth: { te: 'నెల', en: 'Month' },
  adminTrips: { te: 'ట్రిప్‌లు', en: 'Trips' },
  adminCrates: { te: 'క్రేట్లు', en: 'Crates' },
  adminCrateHours: { te: 'క్రేట్-గంటలు', en: 'Crate-hours' },
  adminOverstays: { te: 'ఆలస్యాలు', en: 'Overstays' },
  adminBoats: { te: 'బోట్లు', en: 'Boats' },
  adminPerDay: { te: 'రోజువారీ క్రేట్లు', en: 'Crates per day' },
  adminPerBox: { te: 'బాక్స్ వారీగా', en: 'By box' },
  adminUtilisation: { te: 'వాడకం శాతం', en: 'Utilisation' },
  adminDwell: { te: 'సగటు నిల్వ', en: 'Avg. dwell' },
  adminOverstayRate: { te: 'ఆలస్య శాతం', en: 'Overstay rate' },
  adminTrend: { te: 'గత నెలతో పోలిక', en: 'vs last month' },
  adminPeakHour: { te: 'రద్దీ సమయం', en: 'Busiest hour' },
  adminPerHour: { te: 'ఏ గంటకు ఎన్ని బోట్లు వస్తాయి', en: 'Arrivals by hour of day' },
  adminInsights: { te: 'విశ్లేషణ', en: 'Insights' },
  adminExport: { te: 'ఎక్సెల్ ఫైల్ డౌన్‌లోడ్', en: 'Download for Excel' },
  adminPerBoat: { te: 'బోటు వారీగా', en: 'By boat' },

  adminLocked: { te: 'చాలాసార్లు తప్పింది. {0} సెకన్ల తర్వాత ప్రయత్నించండి.', en: 'Too many attempts. Try again in {0}s.' },
  adminUnavailable: { te: 'సురక్షిత కనెక్షన్ (HTTPS) లేకుండా అడ్మిన్ తెరవలేము.', en: 'Admin needs a secure (HTTPS) connection.' },
  adminSessionNote: { te: '5 నిమిషాలు పని లేకపోతే ఆటోమేటిక్‌గా మూసుకుంటుంది.', en: 'Locks itself after 5 minutes of inactivity.' },
  adminAudit: { te: 'చర్యల రికార్డు', en: 'Action log' },
  adminAuditIntact: { te: 'రికార్డు చెక్కుచెదరలేదు', en: 'Log verified intact' },
  adminAuditBroken: { te: 'రికార్డు మార్చబడింది — ఎంట్రీ {0}', en: 'Log tampered at entry {0}' },
  adminAuditEmpty: { te: 'ఇంకా చర్యలు లేవు.', en: 'No admin actions yet.' },
  confirmQ: { te: 'ఖచ్చితమా?', en: 'Sure?' },

  voiceRead: { te: 'ఖాళీ స్థలం చదువు', en: 'Read free space' },
  voiceStop: { te: 'ఆపు', en: 'Stop' },
  voiceNone: { te: 'ఈ ఫోన్‌లో వాయిస్ సదుపాయం లేదు', en: 'This phone has no speech support' },

  // — Catch tagging (icon grid, zero typing) ——————————
  catchTitle: { te: 'ఏ చేప?', en: 'What is the catch?' },
  catchBody: { te: 'బొమ్మ మీద నొక్కండి. టైప్ చేయనవసరం లేదు.', en: 'Tap a picture. No typing needed.' },
  prawn: { te: 'రొయ్యలు', en: 'Prawn' },
  crab: { te: 'పీత', en: 'Crab' },
  sardine: { te: 'కవ్వాలు', en: 'Sardine' },
  mackerel: { te: 'బంగడ', en: 'Mackerel' },
  pomfret: { te: 'చందువా', en: 'Pomfret' },
  mixed: { te: 'కలగలుపు', en: 'Mixed' },
  adminPerSpecies: { te: 'చేప వారీగా', en: 'By catch' },

} as const

export type StringKey = keyof typeof S

/** Translate `key`, substituting `{0}`, `{1}` … with `args`. */
export function t(lang: Lang, key: StringKey, ...args: Array<string | number>): string {
  return S[key][lang].replace(/\{(\d+)\}/g, (_, i: string) => String(args[Number(i)] ?? ''))
}

/** A `t` bound to one language — what components take as their `t` prop. */
export type T = (key: StringKey, ...args: Array<string | number>) => string

export function translator(lang: Lang): T {
  return (key, ...args) => t(lang, key, ...args)
}

export const BOX_NAME: Record<BoxId, StringKey> = {
  box1: 'box1',
  box2: 'box2',
  box3: 'box3',
}

export const BOX_SHORT: Record<BoxId, StringKey> = {
  box1: 'box1Short',
  box2: 'box2Short',
  box3: 'box3Short',
}

export const BOX_PLACE: Record<BoxId, StringKey> = {
  box1: 'box1Place',
  box2: 'box2Place',
  box3: 'box3Place',
}
