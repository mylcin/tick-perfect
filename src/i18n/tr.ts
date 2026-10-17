import type { Dictionary } from './dictionary';

/** "38 ms", or "1,2 sn" past a second, with a Turkish decimal comma. */
function formatMs(ms: number): string {
  return ms < 1000
    ? `${String(Math.max(1, Math.round(ms)))} ms`
    : `${(ms / 1000).toFixed(1).replace('.', ',')} sn`;
}

/** Keeps a short phrase on one line. */
const NBSP = '\u00a0';

/** "9 ms geç", "4 ms erken" or "zamanında", from a signed whole ms. */
function rateText(ms: number): string {
  if (ms === 0) return 'zamanında';
  return `${String(Math.abs(ms))} ms ${ms > 0 ? 'geç' : 'erken'}`;
}

export const tr: Dictionary = {
  languageName: 'Türkçe',
  locale: 'tr',

  title: {
    tagline: 'Mekanik bir saatte tek dokunuşluk zamanlama oyunu',
    play: 'Oynamak için dokun',
    loading: 'Saat kuruluyor…',
    keyHint: 'Oynamak için Boşluk · gezinmek için ← →',
    best: score => `En iyi ${String(score)}`,
    firstRule: 'Bir kez kaçırırsan tur biter · parlak merkez Mükemmel',
    settings: 'Ayarlar',
    help: 'Nasıl oynanır',
    unsupportedWebgl:
      'Tarayıcında 3D grafikler kapalı. Ayarlarından donanım hızlandırmayı aç, sonra sayfayı yenile.',
    loadFailed: 'Saat yüklenemedi. Bağlantını kontrol edip yeniden dene.',
    stopped: 'Saat artık gösterilemiyor. Geri getirmek için sayfayı yenile.',
    reload: 'Yenile',
  },

  storage: {
    notSaved:
      'Bu tarayıcı ilerlemeni saklamıyor. Kaydetmek için site verilerine izin ver.',
  },

  homeScreen: {
    hint: 'İlerlemen güvende kalsın diye Ana Ekrana ekle. Orada sıfırdan başlar: önce Ayarlar’dan yedekle, sonra geri yükle.',
    dismiss: 'İpucunu kapat',
  },

  help: {
    title: 'Nasıl oynanır',
    close: 'Nasıl oynanır panelini kapat',
    tapTitle: 'Zamanında dokun',
    tap: 'Saniye ibresi işarete geldiğinde dokun. Her isabet ibreyi hızlandırır; bir kez kaçırırsan tur biter.',
    perfectTitle: 'Mükemmel',
    perfect: (perfect, good) =>
      `İşaretin parlak merkezi Mükemmel sayılır: +${String(good)} yerine +${String(perfect)}.`,
    streakTitle: 'Seri',
    tier: (count, factor) => `${String(count)} Mükemmel ×${String(factor)}`,
    streak: tiers =>
      `Üst üste gelen Mükemmeller her puanı katlar: ${tiers}. Sıradan bir isabet seriyi bitirir.`,
    watchTitle: watch => `${watch} kuralı`,
  },

  collection: {
    label: 'Saatler',
    locked: 'Kilitli',
    endless: 'Endless',
    toUnlock: 'Kilidi açmak için',
    scoreStep: (watch, score) => `${watch} ile ${String(score)} puan yap`,
    levelStep: level => `${String(level)}. seviyeye ulaş`,
    progress: (best, needed) =>
      `En${NBSP}iyi${NBSP}${String(best)}/${String(needed)}`,
    pointsProgress: (points, needed) =>
      `${String(points)}/${String(needed)}${NBSP}puan`,
    stepDone: 'tamam',
    best: score => `En iyi ${String(score)}`,
    noCertificate: 'Henüz sertifika yok',
  },

  level: {
    name: level => `Seviye ${String(level)}`,
    points: (points, next) =>
      next === null
        ? `${String(points)}${NBSP}puan`
        : `${String(points)}${NBSP}/${NBSP}${String(next)}`,
    summary: (level, points, next) =>
      `Saatçi seviyesi ${String(level)}, ${
        next === null
          ? `${String(points)} puan`
          : `${String(points)}/${String(next)} puan`
      }`,
    reached: level => `Yeni seviye: ${String(level)}`,
  },

  daily: {
    name: number => `Daily #${String(number)}`,
    best: score => `Bugün ${String(score)}`,
    button: (number, watch) => `Daily #${String(number)}, ${watch}.`,
    todaysBest: score => `Bugünün en iyisi ${String(score)}.`,
    reserveOf: (days, most) =>
      `Güç rezervi ${String(days)} gün, en fazla ${String(most)}.`,
    reserve: days => `Güç rezervi ${String(days)} gün`,
    wound: '+1 gün kuruldu',
    next: (hours, minutes) =>
      `Yeni Daily ${hours > 0 ? `${String(hours)} sa ` : ''}${String(minutes)} dk sonra`,
    ready: number => `Daily #${String(number)} hazır`,
    intro: 'Bugün herkese aynı hedefler · güç rezervini kurar',
  },

  practice: {
    open: 'Antrenman',
    paces: { slow: 'Yavaş', normal: 'Normal' },
    pace: 'Tempo',
    good: 'İyi',
    miss: 'Iska',
    timing: rateText,
    missed: timing =>
      timing === null
        ? 'Iska. Sıradaki hedef.'
        : `Iska, ${timing}. Sıradaki hedef.`,
    title: 'Antrenman seti',
    hits: (hits, of) => `${String(of)} hedefin ${String(hits)} tanesi vuruldu`,
    perfects: 'Mükemmel',
    misses: 'Iska',
    bestStreak: 'En iyi seri',
    rate: 'Ortalama',
    spread: 'Sapma',
    note: 'Iska, sıradaki hedefe geçer. Antrenman hiçbir şeye sayılmaz: rekor, seviye, Daily ya da başarım yok.',
    again: 'Tekrar',
    menu: 'Ana menü',
  },

  atelier: {
    title: 'Atölye',
    close: 'Atölyeyi kapat',
    intro:
      'Her saatin kuralı gerçek bir komplikasyondan gelir. İşte hikayesi ve ustalaşmak için kalanlar.',
    watches: 'Saatler',
    collection: 'Koleksiyon',
    complete: share =>
      `%${new Intl.NumberFormat('tr', { maximumFractionDigits: 0 }).format(share * 100)} tamamlandı`,
    tally: (done, of) => `${String(done)}/${String(of)}`,
    tallies: {
      watches: 'Saatler',
      certificates: 'Sertifikalar',
      variants: 'Renkler',
      achievements: 'Başarımlar',
    },
    complications: {
      diver: {
        name: 'Dönen dalış çerçevesi',
        text: 'Dalgıç suya girmeden çerçevenin işaretini yelkovana getirir ve geçen dakikaları oradan okur. Çerçeve yalnızca bir yöne döner; bir çarpma dalışı uzun gösterebilir, asla kısa değil.',
      },
      chronograph: {
        name: 'Kronograf',
        text: 'Saatin içine kurulmuş bir kronometre: bir düğme ibresini başlatıp durdurur, öbürü sıfıra döndürür. Yarış pilotları ve havacılar turlarını ve uçuş ayaklarını onunla ölçtü.',
      },
      gmt: {
        name: 'GMT ibresi',
        text: 'Dördüncü bir ibre 24 saatlik bir ölçekte günde bir tur atarak ikinci bir saat dilimini tutar. 1950’lerde, uçuşların okyanusları ilk kez bir günde aştığı yıllarda havayolu ekipleri için yapıldı.',
      },
      moonphase: {
        name: 'Ay evresi',
        text: 'Üzerine iki ay boyanmış bir disk, tepe biçimli bir pencerenin altında her gün biraz döner; ay orada da gökyüzündeki gibi büyür, dolunay olur ve küçülür. Işığı gelip gider, yeri değişmez.',
      },
      tourbillon: {
        name: 'Tourbillon',
        text: 'Breguet’nin yerçekimine cevabı, 1801’de patentlendi: eşapman bir kafes içinde yaklaşık dakikada bir döner, böylece saatin tek bir duruşta biriktirdiği hatalar dengelenir. Saat nasıl tutulursa tutulsun işleyişi şaşmaz.',
      },
      grandComplication: {
        name: 'Büyük komplikasyon',
        text: 'Tek bir komplikasyon değil, tek bir mekanizmada birçoğu: saatçiliğin zirvesi, ustanın mesleğin her şeyini gösterdiği yer. Endless, ilk serinin bütün kurallarını tek bir turda ister.',
      },
      field: {
        name: 'Durdurulabilen saniye',
        text: 'Saha saatinde kurma kolu çekilince saniye ibresi durur; askerler birlikte yola çıkmadan önce saatlerini aynı saniyeye ayarlayabilsin diye. İbre bekler, sonra kaldığı yerden devam eder.',
      },
      pilot: {
        name: 'Gözlemci kadranı',
        text: '1940’ların navigatör saatleri, kokpitte bir bakışta okunsun diye kocaman ve sade yapıldı; 12’de bir üçgen vardı. Bulutun içinde uçan pilot manzaraya değil göstergelere güvenir.',
      },
      digital: {
        name: 'Geri sayım',
        text: 'Analog-dijital saat ibreleri, geri sayıp sıfırda öten bir sıvı kristal ekranla birleştirir: yelkenciler yarışın başlangıç çizgisini tam silah atıldığı anda geçmek için onu kullanır.',
      },
    },
    inGame: 'Oyunda',
    mastery: (done, of) => `Ustalık: ${String(done)}/${String(of)}`,
    best: score => `En iyi ${String(score)}`,
    certificateGoal: score => `En iyi skor ${String(score)}`,
    variantGoal: certificate => `${certificate} ile kazanılır`,
    done: 'tamamlandı',
    todo: 'yapılacak',
  },

  challenge: {
    title: 'Meydan okuma',
    card: (watch, score) => `Meydan okuma · ${watch} · Hedef ${String(score)}`,
    beat: score => `Hedef ${String(score)}`,
    play: 'Oyna',
    dismiss: 'Meydan okumayı kapat',
    invalid: 'Bu meydan okuma bağlantısı eksik. Yeniden iste.',
    earlierRules: 'Eski kurallarla oynanmış: hedefler farklı.',
    laterRules: 'Yeni kurallarla oynanmış: hedefler farklı.',
    locked: watch => `Bu meydan okuma için önce ${watch} saatini aç.`,
  },

  rules: {
    diver: 'Bezel arada bir döner ve işareti taşır.',
    chronograph: 'Çift işaret: önce başlangıç, sonra bitiş işaretine dokun.',
    gmt: 'İşaretin taralı kısmında dokunma: orayı GMT ibresi örtüyor.',
    moonphase: 'Bazı işaretler kaybolur. Oldukları yere dokun.',
    tourbillon:
      'Saat arada bir bilekte sağa sola sallanır. Zamanlama değişmez.',
    grandComplication: 'Endless: ilk serinin bütün kuralları bir arada.',
    field: 'İbre arada bir işaretten önce durur. Yeniden yürümesini bekle.',
    pilot: 'Kadranın üstünden arada bir bulut geçer. İbre içinden geçip gider.',
    digital: 'Ekran arada bir bip sesiyle 3, 2, 1 sayar. Sıfırda dokun.',
  },

  certificates: {
    adjusted: 'Adjusted',
    chronometer: 'Chronometer',
    observatory: 'Observatory',
  },

  engravings: {
    names: {
      isochronism: 'Isochronism',
      beatError: 'Beat error',
      positionalTest: 'Positional test',
      powerReserve: 'Power reserve',
      escapement: 'Escapement',
    },
    rules: {
      isochronism: 'Bir turda 50 dokunuş, 15 ms altı sapma',
      beatError: 'Art arda 10 Perfect',
      positionalTest: 'İlk altı saatin hepsinde Observatory',
      powerReserve: 'Rezerv 7 güne kadar kurulu',
      escapement: 'Toplam 1.000 Perfect',
    },
    engraved: names => `Arka kapağa kazındı: ${names}`,
    show: 'Başarımlar',
    hide: 'Kadrana dön',
    intro: 'Her başarım saatin arka kapağına kazınır.',
    heading: watch => `${watch} arka kapağı`,
    onThisWatch: 'Bu saatte kazanılanlar',
    onEvery: 'Her arka kapakta',
    done: 'Kazındı',
    progress: (now, of) => `${String(now)}${NBSP}/${NBSP}${String(of)}`,
  },

  variants: {
    label: 'Renk seçeneği',
    names: {
      standard: 'Standart',
      green: 'Yeşil Sunburst',
      blue: 'Mavi Sunburst',
      panda: 'Beyaz Opalin',
      cream: 'Krem Opalin',
      blueBlack: 'Mavi-Siyah Seramik',
      burgundyBlack: 'Bordo-Siyah Yaldız',
      midnightBlue: 'Gece Mavisi Sunburst',
      black: 'Siyah Lake',
      yellow: 'Sarı Karbon',
      orangeBlack: 'Turuncu Karbon',
      silver: 'Gümüş Opalin',
      navy: 'Lacivert Rose Gold',
      olive: 'Zeytin Mat',
      bronze: 'Kahve Bronz',
      brownGold: 'Kahve Rose Gold',
      red: 'Kırmızı Reçine',
      gold: 'Altın Çelik',
    },
    requirement: (certificate, score) =>
      `${certificate} sertifikası (${String(score)} puan)`,
    earned: (names, count) =>
      `Yeni renk ${count === 1 ? 'seçeneği' : 'seçenekleri'}: ${names}`,
  },

  tips: {
    perfect: points => `Mükemmel: parlak merkez ${String(points)} puan`,
    streak: (count, factor) => {
      const run = `Üst üste ${String(count)} Mükemmel`;
      if (factor === 2) return `${run} her puanı ikiye katlar`;
      if (factor === 3) return `${run} her puanı üçe katlar`;
      return `${run}: her puan ×${String(factor)}`;
    },
    multiplier: factor => `Sıradan bir isabete kadar ×${String(factor)}`,
    streakBroken: 'Sıradan bir isabet seriyi bitirir',
  },

  game: {
    twistHints: {
      turn: 'İşaret dönerken onu takip et',
      chrono: '▶ işaretinde, sonra ■ işaretinde dokun',
      gmtWait: 'GMT ibresi çekilince, çizgiden sonra dokun',
      gmtBeat: 'GMT ibresi gelmeden, çizgiden önce dokun',
      moon: 'Nerede olduğunu hatırla',
      sway: 'Saat sallanıyor; zamanlama aynı',
      hack: 'İbre duruyor; yeniden yürümesini bekle',
      cloud: 'Bulutun içinden: gözün ibrede olsun',
      countdown: 'Bip seslerini say: sıfırda dokun',
    },
    heading: watch => `Tick Perfect, ${watch}`,
    surface: 'Saniye ibresi işarete geldiğinde dokun',
    hint: {
      touch: 'İbre işarete geldiğinde dokun',
      keys: 'İbre işarete geldiğinde dokun ya da Boşluk tuşuna bas',
    },
    ready: 'Hazır ol',
    pause: 'Duraklat',
    perfect: 'Mükemmel',
    points: points => `+${String(points)}`,
    multiplier: factor => `×${String(factor)}`,
    score: score => `Puan ${String(score)}`,
    best: score => `En iyi ${String(score)}`,
    today: score => `Bugün ${String(score)}`,
    toBeat: score => `Hedef ${String(score)}`,
    practice: (target, of) => `Antrenman ${String(target)}/${String(of)}`,
    streak: (streak, needed, next) =>
      next === null
        ? 'Mükemmel serisi: en yüksek çarpan'
        : `Mükemmel serisi: ${String(streak)}, ×${String(next)} için gereken ${String(needed)}`,
  },

  pause: {
    title: 'Duraklatıldı',
    resume: 'Devam et',
    restart: 'Baştan başla',
    menu: 'Ana menü',
    countdown: 'Devam ediliyor',
    restoring: 'Saat yeniden hazırlanıyor…',
    leaveQuestion: score => `Bu turdaki ${String(score)} puan kaydedilmeyecek.`,
    leave: 'Turu bırak',
    stay: 'Geri dön',
  },

  gameOver: {
    title: 'Oyun bitti',
    reasons: {
      early: 'Çok erken',
      late: 'Çok geç',
      passed: 'İbre işareti geçti',
      blocked: 'GMT ibresi işareti örttü',
    },
    score: 'Puan',
    best: 'En iyi',
    today: 'Bugün',
    toBeat: 'Hedef',
    newBest: 'Yeni rekor',
    beaten: toBeat => `${String(toBeat)} geçildi`,
    toBeatShort: (points, toBeat) =>
      `${String(toBeat)} puanı geçmeye ${String(points)} puan kaldı`,
    retry: 'Tekrar dene',
    early: ms => `${formatMs(ms)} erken`,
    late: ms => `${formatMs(ms)} geç`,
    toUnlock: (points, watch) =>
      `Kilidi açmaya ${String(points)} puan kaldı: ${watch}`,
    toCertificate: (points, certificate) =>
      `${certificate} sertifikasına ${String(points)} puan kaldı`,
    toBest: points => `En iyi puanına ${String(points)} puan kaldı`,
    toLevel: (points, level) =>
      `${String(level)}. seviyeye ${String(points)} puan kaldı`,
    unlocked: watches => `Kilidi açıldı: ${watches}`,
    playWatch: watch => `${watch} ile oyna`,
    certified: certificate => `${certificate} sertifikası kazanıldı`,
    timing: (rate, spread) =>
      `${rate === 0 ? 'Tam zamanında' : `Zamanlama ${rateText(rate)}`} · ±${String(spread)} ms`,
    menu: 'Ana menü',
  },

  settings: {
    title: 'Ayarlar',
    close: 'Ayarları kapat',
    sound: 'Ses',
    vibration: 'Titreşim',
    vibrationUnsupported: 'Bu cihazda desteklenmiyor',
    appearance: 'Görünüm',
    themes: { system: 'Sistem', light: 'Açık', dark: 'Koyu' },
    night: 'Gece modu',
    nightHint: 'Karanlık stüdyo, parlayan fosfor',
    reducedMotion: 'Animasyonları kapat',
    reducedMotionHint: 'Yalnızca oyunun kendi hareketi kalır',
    reducedMotionSystem: 'Sistem ayarına uyuyor',
    batterySaver: 'Pil tasarrufu',
    batterySaverHint: 'Daha az güç harcayan sade grafikler',
    language: 'Dil',
    progress: 'İlerleme',
    progressHint:
      'Bu tarayıcıda saklanır. Güvende kalsın diye bir dosyaya yedekle.',
    backUp: 'İlerlemeyi yedekle',
    restore: 'Geri yükle',
    restoreOutcomes: {
      restored: 'İlerleme geri yüklendi. Sende olan hiçbir şey kaybolmadı.',
      unchanged: 'Bu yedekte yeni bir şey yok: hepsi zaten sende.',
      unreadable: 'Dosya okunamadı.',
      tooLarge: 'Bu dosya bir yedek olamayacak kadar büyük.',
      foreign: 'Bu dosya bir Tick Perfect yedeği değil.',
    },
    reset: 'Baştan başla',
    resetHint: 'Ayarlar ve ilerleme ayrı ayrı sıfırlanır.',
    resetSettings: 'Ayarları sıfırla',
    settingsReset: 'Ayarlar varsayılanlarına döndü.',
    eraseProgress: 'İlerlemeyi sil',
    eraseConfirm:
      'Bu cihazdaki tüm skorlar, saatler, Daily’ler ve başarımlar silinsin mi? İleride lazım olabilirse önce yedekle.',
    erase: 'Sil',
    keepProgress: 'Vazgeç',
    progressErased: 'İlerleme silindi. Bu cihaz sıfırdan başlıyor.',
    eraseSignedIn:
      'İlerlemen hesabında da duruyor, silsen de geri gelir. Bu cihazdan silmek için önce çıkış yap.',
    privacy: 'Gizlilik ve aydınlatma metni',
  },

  leaderboard: {
    title: 'Liderlik tablosu',
    close: 'Liderlik tablosunu kapat',
    boards: 'Tablolar',
    season: watch => `${watch} sezonu`,
    event: name => name,
    daily: number => `Daily #${String(number)}`,
    loading: 'Tablo yükleniyor…',
    empty: 'Henüz skor yok. İlk sen ol.',
    unreachable: 'Liderlik tablosuna şu an ulaşılamıyor.',
    closed: 'Liderlik tablosu şimdilik kapalı.',
    rank: rank => `#${String(rank)}`,
    you: (rank, score) => `Sen: ${String(score)} ile #${String(rank)}`,
    youMark: 'sen',
    notOnBoard: 'Bu tabloda henüz yoksun.',
    signInPrompt:
      'Skorlarını tablolara koymak için giriş yap. Oynamak için hesap hiç gerekmez.',
    google: 'Google ile devam et',
    github: 'GitHub ile devam et',
    privacy:
      'Görünen adını, skorlarını, her birini doğrulamak için onları oluşturan dokunuşları ve seni başka cihazda da beklesin diye ilerlemeni saklarız. Adın ve en iyi skorların tablolarda herkese açıktır. Hepsini istediğin zaman silebilirsin.',
    privacyLink: 'Gizlilik ve aydınlatma metni',
    signingIn: 'Giriş yapılıyor…',
    signInFailed: 'Giriş yapılamadı. Tekrar dene.',
    signedInAs: name => `${name} olarak giriş yapıldı`,
    rename: 'Adı değiştir',
    nameLabel: 'Görünen ad',
    nameRule: '2 ile 24 karakter arası.',
    save: 'Kaydet',
    cancel: 'Vazgeç',
    signOut: 'Çıkış yap',
    deleteAccount: 'Hesabımı sil',
    deleteConfirm:
      'Bu işlem hesabını, skorlarını ve çevrimiçi kayıtlı ilerlemeni siler. Bu cihazdaki ilerlemen kalır.',
    deleteYes: 'Hepsini sil',
    deleted: 'Hesabın silindi.',
    failed: 'Olmadı. Tekrar dene.',
    posting: 'Skorun gönderiliyor…',
    posted: (rank, best) =>
      `Tabloda #${String(rank)}, en iyin ${String(best)}.`,
    flagged: 'Skorun incelemeyi bekliyor.',
    rejected: 'Bu skor doğrulanamadı, tabloya girmedi.',
    postFailed: 'Liderlik tablosuna ulaşılamadı; bu skor tabloda değil.',
    signInToPost: 'Sonraki turlarını tabloya göndermek için giriş yap',
  },

  timegrapher: {
    title: 'Timegrapher',
    close: 'Timegrapher panelini kapat',
    watches: 'Saatler',
    intro:
      'Her isabet milisaniyesine kadar ölçülür. İstikrarlı bir oyuncu sıfır çizgisi boyunca dümdüz bir iz bırakır.',
    empty:
      'Henüz ölçüm yok. Bir tur oyna; her isabet, erken ya da geç, buraya çizilir.',
    rate: 'Ortalama',
    spread: 'Sapma',
    perfect: 'Mükemmel',
    hits: 'İsabet',
    rateValue: rateText,
    spreadValue: ms => `±${String(ms)} ms`,
    perfectValue: share =>
      new Intl.NumberFormat('tr', {
        style: 'percent',
        maximumFractionDigits: 0,
      }).format(share),
    hitsValue: count => new Intl.NumberFormat('tr').format(count),
    late: 'geç',
    early: 'erken',
    trace: (count, rate, spread) =>
      `Son ${String(count)} isabetin izi: ortalama ${rateText(rate)}, sapma ±${String(spread)} ms.`,
    latest: 'Son turlar',
    latestNote:
      'Bu saatte, her modda, önceki aynı sayıda turla karşılaştırılarak. Mükemmel: Perfect’lerin isabetlere oranı; ortalama: isabetlerin ortalama hatası, geç +; sapma: isabetlerin bunun çevresinde ne kadar dağıldığı.',
    lastRounds: count => `Son ${String(count)}`,
    roundsSoFar: count => `Şimdiye dek ${String(count)} tur`,
    averageScore: 'Ort. skor',
    averageScoreValue: score =>
      new Intl.NumberFormat('tr', { maximumFractionDigits: 1 }).format(score),
    change: (change, count) => `önceki ${String(count)} tura göre ${change}`,
    daily: 'Daily',
    dailyRun: days => `Art arda ${String(days)} gün`,
    dailyPlayed: (played, days) =>
      `Son ${String(days)} günde ${String(played)} gün oynandı`,
    dailyDay: (number, best) =>
      best === null
        ? `Daily #${String(number)}: oynanmadı`
        : `Daily #${String(number)}: en iyi ${String(best)}`,
  },

  announce: {
    started:
      'Tur başladı. İbre işarete geldiğinde dokun ya da Boşluk tuşuna bas.',
    rule: rule => `Yeni kural: ${rule}`,
    locked: requirement => `Kilitli. ${requirement}.`,
    multiplierOn: factor => `×${String(factor)} çarpan devrede`,
    multiplierOff: 'Çarpan bitti',
    paused: 'Oyun duraklatıldı',
    resumed: 'Oyun devam ediyor',
    gameOver: (score, best, isNewBest) =>
      `Oyun bitti. Puan ${String(score)}. ${isNewBest ? 'Yeni rekor!' : `En iyi ${String(best)}.`}`,
    roundOver: score => `Oyun bitti. Puan ${String(score)}.`,
    dailyOver: (number, score, best, isNewBest) =>
      `Daily #${String(number)} bitti. Puan ${String(score)}. ${isNewBest ? 'Bugünün yeni rekoru!' : `Bugünün en iyisi ${String(best)}.`}`,
    beaten: toBeat => `${String(toBeat)} geçildi!`,
  },
};
