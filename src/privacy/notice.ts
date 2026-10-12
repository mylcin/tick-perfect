import type { Language } from '../i18n';

// The privacy notice at /privacy: what the game does with personal data, as
// the GDPR (Art. 13) and the KVKK (Art. 10) ask a controller to say. It
// describes this code; when the code changes what it keeps, this changes
// with it, and so does NOTICE_DATE.
//
// Paragraphs may hold links as [text](url) and **bold** text.

/** When the notice last changed, as YYYY-MM-DD. */
const NOTICE_DATE = '2026-10-11';

export type Block = string | { readonly list: readonly string[] };

export interface Section {
  /** Stable, for links to a section and for tests. */
  readonly id: string;
  readonly title: string;
  readonly blocks: readonly Block[];
}

export interface Notice {
  readonly title: string;
  readonly updated: string;
  readonly intro: readonly Block[];
  readonly sections: readonly Section[];
  readonly back: string;
  /** The language switch's accessible name. */
  readonly languages: string;
}

/** What the notice depends on in this deployment. */
export interface NoticeFacts {
  /** Who is responsible; null in a build that doesn't name anyone. */
  readonly controller: string | null;
  readonly email: string | null;
  /** Whether this build has the online side: sign-in, boards, reports. */
  readonly online: boolean;
  readonly repository: string;
}

const VERCEL = '[Vercel Inc.](https://vercel.com/legal/privacy-policy)';
const SUPABASE = '[Supabase, Inc.](https://supabase.com/privacy)';
const GOOGLE = '[Google LLC](https://policies.google.com/privacy)';
const GITHUB =
  '[GitHub, Inc.](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement)';

function dateIn(language: Language): string {
  const [year, month, day] = NOTICE_DATE.split('-').map(Number) as [
    number,
    number,
    number,
  ];
  return new Intl.DateTimeFormat(language === 'tr' ? 'tr-TR' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

const mail = (email: string) => `[${email}](mailto:${email})`;

function english(facts: NoticeFacts): Notice {
  const { controller, email, online, repository } = facts;
  const named = controller !== null && email !== null;
  const sections: Section[] = [
    {
      id: 'controller',
      title: 'Who is responsible',
      blocks: [
        named
          ? `The data controller is ${controller}. You can reach them at ${mail(email)}.`
          : `This copy of the game is run by whoever deployed it, who is responsible for the data its server handles. The game's code is public at [its repository](${repository}).`,
      ],
    },
    {
      id: 'playing',
      title: 'Playing without an account',
      blocks: [
        `Your progress, best scores, settings and timing statistics stay in your browser’s storage, on your device. They are not sent to us${online ? ' unless you sign in (below)' : ''}. Clearing this site’s data in your browser deletes them.`,
        'Your browser also keeps a copy of the game’s files, so it plays offline. The game uses no cookies, no analytics, no advertising and no tracking.',
        `The game is served by ${VERCEL}. Like any web server, it processes your network (IP) address and the details of each request, such as the page and your browser, to deliver the game and protect it from abuse, and keeps them in its logs for a short time. This rests on our legitimate interest in running the game securely (GDPR Art. 6(1)(f); KVKK Art. 5(2)(f)).`,
        'Challenge links and share cards are made on your device and hold only the watch (or the Daily’s number), the round, the score, the order of your Perfects and plain hits, and the version of the watch’s rules. They go wherever you choose to send them.',
        'A backup of your progress, made in the settings, is a file saved on your device, holding the same progress as above but not your settings. It goes nowhere unless you send it, and restoring one reads it on your device.',
      ],
    },
  ];

  if (online) {
    sections.push(
      {
        id: 'reports',
        title: 'Leaderboards and error reports',
        blocks: [
          'The game fetches the current rules and the leaderboards from its own server. Nothing about you is stored to do this.',
          'If the game runs into an error, your browser sends a report to the game’s server: the error message, where in the game’s code it happened, the game’s version, the page’s address without its query, and the name and version of your browser and operating system. Your browser also reports when the game’s security policy blocks something on the page, with the same kind of details. Reports name no player and no account, and keep neither your network address nor your browser’s full identification string.',
          'To stop floods of reports, the server counts them per network address. The address is kept with its count for an hour, then deleted.',
          'Reports are kept for 30 days, to find and fix faults. This rests on our legitimate interest in a game that works (GDPR Art. 6(1)(f); KVKK Art. 5(2)(f)).',
        ],
      },
      {
        id: 'account',
        title: 'If you sign in',
        blocks: [
          'Signing in is optional. You need it only to put scores on the leaderboards; your progress then follows you to your other devices.',
          `You sign in with Google or GitHub, through the sign-in service of ${SUPABASE}. Your provider passes on your name, email address, profile picture address and an account identifier. Supabase keeps these with your sign-in, together with records of your sign-ins (such as their times and network addresses), so that you can sign in securely.`,
          'While you are signed in, your browser keeps your sign-in session (a token holding your account id, email address and name) in this site’s storage, until you sign out. Signing in can’t work without it.',
          'The game itself keeps, collected automatically as you play:',
          {
            list: [
              'your player id and display name. The name starts as the one your provider gives, and you can change it. The game doesn’t use your email address or your picture.',
              'for each ranked round: its seed, the time of each tap, pause and resume within it, its score and statistics (hits, Perfects, streak, timing spread), the game’s version, and when it was played. The taps are kept so the server can replay the round and check its score.',
              'your best score on each leaderboard.',
              'your progress, copied to your account when you sign in and at most once a minute as you play, so you can carry on from any device: unlocks and best scores, the watch variants you picked, your latest Daily result, your power reserve, your timing statistics and what is engraved on your casebacks. Your settings stay on your device.',
              'your network address with a count, for an hour, to limit how many rounds one address can start.',
            ],
          },
          '**Your display name and best scores are public:** anyone can see them on the leaderboards.',
          'Running the leaderboards and keeping your account and progress is the service you asked for (GDPR Art. 6(1)(b); KVKK Art. 5(2)(c)). Checking scores, limiting requests and moderating the boards rest on our legitimate interest in fair, secure leaderboards (GDPR Art. 6(1)(f); KVKK Art. 5(2)(f)).',
          'A round played with machine-like steadiness is held for a person to review, rather than posted at once. An admin may also remove a score or ban an account that cheats. Admins’ actions are logged, with the id of the account they concerned. No decision with legal or similarly significant effects is made about you by automated means alone.',
        ],
      }
    );
  }

  sections.push(
    {
      id: 'recipients',
      title: 'Who else receives it',
      blocks: [
        {
          list: [
            `${VERCEL} (USA) hosts the game${online ? ' and its server' : ''}, as our processor.`,
            ...(online
              ? [
                  `${SUPABASE} (USA) runs the game’s database and its sign-in service, as our processor.`,
                  `${GOOGLE} (USA) or ${GITHUB} (USA), whichever you sign in with, handles your sign-in as a separate controller, under its own privacy policy, and learns that you signed in to this game.`,
                ]
              : []),
          ],
        },
        `${online ? 'Vercel and Supabase process' : 'Vercel processes'} the data only on our instructions, under data processing agreements. We sell your data to no one.`,
        'Their servers are outside Turkey, and some are outside the European Union, so the data is transferred abroad. Transfers from the EU to the United States rely on the standard contractual clauses in those agreements; ask us for a copy. For transfers from Turkey, Article 9 of the KVKK applies.',
      ],
    },
    {
      id: 'retention',
      title: 'How long it is kept',
      blocks: [
        {
          list: [
            online
              ? 'On your device: until you clear the site’s data; your sign-in session until you sign out.'
              : 'On your device: until you clear the site’s data.',
            'Vercel’s request logs: up to a day.',
            ...(online
              ? [
                  'Error reports: 30 days.',
                  'Network addresses counted for limits: an hour.',
                  'Your account, best scores and synced progress, and each ranked round’s score and statistics: until you delete your account.',
                  'The taps of a ranked round: 30 days. A round held for review keeps them until it is decided.',
                  'A round that was refused: 30 days. One started but never finished: a day.',
                  'Records of your sign-ins in Supabase’s logs: up to 7 days.',
                  'The log of admins’ actions: for as long as the game runs. When an account is deleted, its entries no longer say which account they concerned.',
                ]
              : []),
          ],
        },
        ...(online
          ? [
              'Deletions after an hour or 30 days run whenever the game’s server is in use, so they can come a little later while nobody plays.',
            ]
          : []),
      ],
    },
    {
      id: 'rights',
      title: 'Your rights',
      blocks: [
        ...(online
          ? [
              'In the leaderboard’s account panel you can change your display name, sign out, and delete your account. Deleting it removes your sign-in, your profile, your rounds, your scores and your synced progress, all at once. A banned account can’t sign in to do this: write to us, and we will delete it.',
            ]
          : []),
        'Under the GDPR you have the right to access your data, to have it corrected or erased, to restrict its processing, and to receive it in a portable form.',
        `**Your right to object:** where we rely on our legitimate interests (server logs${online ? ', error reports, request limits, score checks and moderation' : ''}), you can object at any time, on grounds relating to your situation.`,
        'Under Article 11 of the KVKK you may learn whether your data is processed; ask for information about it; learn its purpose and whether it is used for that purpose; know who receives it in Turkey or abroad; have it corrected if it is incomplete or wrong, and erased or destroyed under the conditions of Article 7; have those recipients told of either; object to a result against you that comes solely from automated analysis; and claim compensation for damage from unlawful processing.',
        named
          ? `To use these rights, write to ${mail(email)}${online ? ', from the email address your account uses if you have one, so we can find it' : ''}. We answer within 30 days, free of charge.`
          : 'To use these rights, contact whoever runs this site. Please don’t post personal details in a public issue.',
        'In the EU you can complain to the supervisory authority where you live or work, without writing to us first. Under the KVKK, write to us first: if we refuse, our answer falls short, or none comes within 30 days, you can complain to the Personal Data Protection Board (Kişisel Verileri Koruma Kurulu).',
      ],
    },
    // Only an online build has accounts at all.
    ...(online
      ? [
          {
            id: 'children',
            title: 'Children',
            blocks: [
              'The game needs no account at any age. Signing in is meant for players old enough to use Google or GitHub on their own. Younger players can play everything without signing in.',
            ],
          },
        ]
      : []),
    {
      id: 'changes',
      title: 'Changes',
      blocks: [
        'When this notice changes, the date at the top changes with it.',
      ],
    }
  );

  return {
    title: 'Privacy notice',
    updated: `Last updated ${dateIn('en')}`,
    intro: [
      'Tick Perfect is a game you can play without an account. This notice says what personal data the game handles, why, and what you can do about it. It is the information that the EU’s General Data Protection Regulation (GDPR) and Turkey’s Law No. 6698 on the Protection of Personal Data (KVKK) ask us to give you.',
    ],
    sections,
    back: 'Back to the game',
    languages: 'Language',
  };
}

function turkish(facts: NoticeFacts): Notice {
  const { controller, email, online, repository } = facts;
  const named = controller !== null && email !== null;
  const sections: Section[] = [
    {
      id: 'controller',
      title: 'Veri sorumlusu',
      blocks: [
        named
          ? `Veri sorumlusu: ${controller}. İletişim: ${mail(email)}.`
          : `Oyunun bu kopyası, onu yayına alan kişi tarafından işletilir; sunucusunun işlediği verilerden o sorumludur. Oyunun kodu [deposunda](${repository}) herkese açıktır.`,
      ],
    },
    {
      id: 'playing',
      title: 'Hesapsız oynarken',
      blocks: [
        `İlerlemeniz, en iyi skorlarınız, ayarlarınız ve zamanlama istatistikleriniz cihazınızda, tarayıcınızın depolama alanında kalır; ${online ? 'giriş yapmadıkça (aşağıda) ' : ''}bize gönderilmez. Tarayıcınızda bu sitenin verilerini temizlemek onları siler.`,
        'Tarayıcınız oyunun dosyalarının bir kopyasını da saklar; böylece oyun çevrimdışı çalışır. Oyun çerez, analiz, reklam ya da izleme kullanmaz.',
        `Oyunu ${VERCEL} sunar. Her web sunucusu gibi, oyunu size ulaştırmak ve kötüye kullanıma karşı korumak için ağ (IP) adresinizi ve her isteğin ayrıntılarını (açılan sayfa, tarayıcınız gibi) işler ve kayıtlarında kısa bir süre tutar. Hukuki sebep, oyunu güvenli biçimde işletmekteki meşru menfaatimizdir (KVKK m. 5/2-f; GDPR m. 6/1-f).`,
        'Meydan okuma bağlantıları ve paylaşım kartları cihazınızda oluşturulur; yalnızca saati (ya da Daily numarasını), turu, skoru, Perfect ve sıradan isabetlerinizin sırasını ve saatin kurallarının sürümünü içerir. Nereye gönderileceğini siz seçersiniz.',
        'Ayarlardan aldığınız ilerleme yedeği, cihazınıza kaydedilen bir dosyadır; yukarıdaki ilerlemeyi içerir, ayarlarınızı içermez. Siz göndermedikçe hiçbir yere gitmez; geri yüklerken de cihazınızda okunur.',
      ],
    },
  ];

  if (online) {
    sections.push(
      {
        id: 'reports',
        title: 'Liderlik tabloları ve hata raporları',
        blocks: [
          'Oyun güncel kuralları ve liderlik tablolarını kendi sunucusundan alır. Bunun için sizinle ilgili hiçbir şey saklanmaz.',
          'Oyun bir hatayla karşılaşırsa tarayıcınız oyunun sunucusuna bir rapor gönderir: hata mesajı, hatanın oyunun kodunda nerede oluştuğu, oyunun sürümü, sayfanın sorgu kısmı çıkarılmış adresi ve tarayıcınızla işletim sisteminizin adı ve sürümü. Oyunun güvenlik politikası sayfada bir şeyi engellediğinde de tarayıcınız aynı türden ayrıntılarla rapor gönderir. Raporlar hiçbir oyuncuyu ya da hesabı belirtmez; ağ adresinizi ve tarayıcınızın tam kimlik bilgisini (user agent) içermez.',
          'Rapor yağmurunu önlemek için sunucu raporları ağ adresine göre sayar. Adres, sayısıyla birlikte bir saat tutulur, sonra silinir.',
          'Raporlar, hataları bulup düzeltmek için 30 gün saklanır. Hukuki sebep, düzgün çalışan bir oyundaki meşru menfaatimizdir (KVKK m. 5/2-f; GDPR m. 6/1-f).',
        ],
      },
      {
        id: 'account',
        title: 'Giriş yaparsanız',
        blocks: [
          'Giriş yapmak isteğe bağlıdır. Yalnızca skorlarınızı liderlik tablolarına koymak için gerekir; ilerlemeniz de böylece diğer cihazlarınıza taşınır.',
          `Google ya da GitHub hesabınızla, ${SUPABASE} şirketinin giriş hizmeti üzerinden giriş yaparsınız. Hesap sağlayıcınız adınızı, e-posta adresinizi, profil fotoğrafınızın adresini ve bir hesap kimliğini iletir. Supabase, güvenli giriş yapabilmeniz için bunları giriş hesabınızla, girişlerinizin kayıtlarıyla (zamanları ve ağ adresleri gibi) birlikte saklar.`,
          'Giriş yaptığınız sürece tarayıcınız, giriş oturumunuzu (hesap kimliğinizi, e-posta adresinizi ve adınızı içeren bir anahtar) çıkış yapana kadar bu sitenin depolama alanında saklar. Giriş bunsuz çalışmaz.',
          'Oyunun kendisi, siz oynarken elektronik ortamda otomatik olarak toplanan şu verileri saklar:',
          {
            list: [
              'oyuncu kimliğiniz ve görünen adınız. Ad, hesap sağlayıcınızın verdiği adla başlar; dilediğiniz zaman değiştirebilirsiniz. Oyun e-posta adresinizi ve fotoğrafınızı kullanmaz.',
              'her sıralamalı tur için: turun tohumu (seed), tur içindeki her dokunuşun, duraklatmanın ve devam etmenin zamanı, skoru ve istatistikleri (isabet, Perfect, seri, zamanlama sapması), oyunun sürümü ve ne zaman oynandığı. Dokunuşlar, sunucunun turu yeniden oynatıp skoru doğrulayabilmesi için saklanır.',
              'her liderlik tablosundaki en iyi skorunuz.',
              'ilerlemeniz: her cihazda kaldığınız yerden devam edebilmeniz için giriş yaptığınızda ve oynarken en fazla dakikada bir hesabınıza kopyalanır. İçeriği: açılan saatler ve en iyi skorlar, seçtiğiniz renk seçenekleri, son Daily sonucunuz, güç rezerviniz, zamanlama istatistikleriniz ve arka kapaklara kazınanlar. Ayarlarınız cihazınızda kalır.',
              'bir adresten başlatılabilecek tur sayısını sınırlamak için ağ adresiniz ve sayısı, bir saat.',
            ],
          },
          '**Görünen adınız ve en iyi skorlarınız herkese açıktır:** liderlik tablolarında herkes görebilir.',
          'Liderlik tablolarını işletmek, hesabınızı ve ilerlemenizi saklamak, istediğiniz hizmetin ifası için gereklidir (KVKK m. 5/2-c; GDPR m. 6/1-b). Skorları doğrulamak, istekleri sınırlamak ve tabloları denetlemek, adil ve güvenli liderlik tabloları için meşru menfaatimize dayanır (KVKK m. 5/2-f; GDPR m. 6/1-f).',
          'Makine gibi kusursuz bir tutarlılıkla oynanan bir tur, hemen tabloya konmak yerine bir kişinin incelemesine bırakılır. Bir yönetici hile yapan bir hesabın skorunu kaldırabilir ya da hesabı yasaklayabilir. Yöneticilerin işlemleri, ilgili hesabın kimliğiyle kayda geçer. Hakkınızda hukuki ya da benzer ölçüde önemli sonuç doğuran hiçbir karar yalnızca otomatik yollarla verilmez.',
        ],
      }
    );
  }

  sections.push(
    {
      id: 'recipients',
      title: 'Verilerin aktarıldığı taraflar',
      blocks: [
        {
          list: [
            `${VERCEL} (ABD) oyunu${online ? ' ve sunucusunu' : ''} veri işleyen olarak barındırır.`,
            ...(online
              ? [
                  `${SUPABASE} (ABD) oyunun veritabanını ve giriş hizmetini veri işleyen olarak işletir.`,
                  `Hangisiyle giriş yaptıysanız ${GOOGLE} (ABD) ya da ${GITHUB} (ABD), girişinizi kendi gizlilik politikası kapsamında, ayrı bir veri sorumlusu olarak işler ve bu oyuna giriş yaptığınızı öğrenir.`,
                ]
              : []),
          ],
        },
        `${online ? 'Vercel ve Supabase verileri' : 'Vercel verileri'} yalnızca bizim talimatımızla, veri işleme sözleşmeleri çerçevesinde işler. Verilerinizi kimseye satmayız.`,
        'Bu şirketlerin sunucuları Türkiye dışında, bir kısmı da Avrupa Birliği dışında olduğundan verileriniz yurt dışına aktarılır. Türkiye’den yurt dışına aktarımda KVKK’nın 9. maddesi uygulanır. AB’den ABD’ye aktarım, bu sözleşmelerdeki standart sözleşme hükümlerine dayanır; bir örneğini bizden isteyebilirsiniz.',
      ],
    },
    {
      id: 'retention',
      title: 'Saklama süreleri',
      blocks: [
        {
          list: [
            online
              ? 'Cihazınızdakiler: sitenin verilerini temizleyene kadar; giriş oturumunuz çıkış yapana kadar.'
              : 'Cihazınızdakiler: sitenin verilerini temizleyene kadar.',
            'Vercel’in istek kayıtları: en fazla bir gün.',
            ...(online
              ? [
                  'Hata raporları: 30 gün.',
                  'Sınırlar için sayılan ağ adresleri: bir saat.',
                  'Hesabınız, en iyi skorlarınız, eşitlenen ilerlemeniz ve her sıralamalı turun skoru ile istatistikleri: hesabınızı silene kadar.',
                  'Sıralamalı bir turun dokunuşları: 30 gün. İncelemeye alınan bir tur, karar verilene kadar onları saklar.',
                  'Reddedilen bir tur: 30 gün. Başlatılıp hiç bitirilmeyen bir tur: bir gün.',
                  'Girişlerinizin Supabase kayıtlarındaki izleri: en fazla 7 gün.',
                  'Yöneticilerin işlem kayıtları: oyun yayında kaldıkça. Bir hesap silindiğinde bu kayıtlar artık hangi hesapla ilgili olduklarını göstermez.',
                ]
              : []),
          ],
        },
        ...(online
          ? [
              'Bir saat ve 30 gün sonra yapılan silmeler, oyunun sunucusu kullanıldıkça çalışır; kimse oynamazken biraz gecikebilir.',
            ]
          : []),
      ],
    },
    {
      id: 'rights',
      title: 'Haklarınız',
      blocks: [
        ...(online
          ? [
              'Liderlik tablosunun hesap bölümünde görünen adınızı değiştirebilir, çıkış yapabilir ve hesabınızı silebilirsiniz. Hesabı silmek giriş hesabınızı, profilinizi, turlarınızı, skorlarınızı ve eşitlenen ilerlemenizi tek seferde kaldırır. Yasaklanmış bir hesap bunun için giriş yapamaz; bize yazarsanız hesabı sileriz.',
            ]
          : []),
        'KVKK’nın 11. maddesi uyarınca kişisel verilerinizin işlenip işlenmediğini öğrenme; işlenmişse buna ilişkin bilgi isteme; işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme; yurt içinde ya da yurt dışında aktarıldığı üçüncü kişileri bilme; eksik ya da yanlış işlenmişse düzeltilmesini isteme; KVKK’nın 7. maddesindeki şartlar çerçevesinde silinmesini ya da yok edilmesini isteme; bu işlemlerin verilerin aktarıldığı üçüncü kişilere bildirilmesini isteme; münhasıran otomatik sistemlerle analiz edilmesi sonucu aleyhinize bir sonuç çıkmasına itiraz etme ve kanuna aykırı işleme nedeniyle zarara uğrarsanız zararın giderilmesini talep etme haklarına sahipsiniz.',
        'AB’de bulunuyorsanız GDPR uyarınca verilerinize erişme, düzeltilmesini ya da silinmesini isteme, işlenmesini kısıtlatma ve taşınabilir biçimde alma haklarınız da vardır.',
        `**İtiraz hakkınız:** Meşru menfaatimize dayanan işlemelere (sunucu kayıtları${online ? ', hata raporları, istek sınırları, skor doğrulama ve moderasyon' : ''}) özel durumunuzdan kaynaklanan sebeplerle her zaman itiraz edebilirsiniz.`,
        named
          ? `Bu haklarınızı kullanmak için ${mail(email)} adresine yazabilirsiniz${online ? '; hesabınızı bulabilmemiz için, varsa hesabınızın kullandığı e-posta adresinden yazmanız yeterlidir' : ''}. Başvurunuz en geç 30 gün içinde, ücretsiz olarak yanıtlanır.`
          : 'Bu haklarınızı kullanmak için siteyi işleten kişiye başvurun. Kişisel bilgilerinizi herkese açık bir kayıtta (issue) paylaşmayın.',
        'AB’de bulunuyorsanız, önce bize başvurmanız gerekmeden yaşadığınız ya da çalıştığınız yerdeki denetim makamına şikâyette bulunabilirsiniz. KVKK kapsamında önce bize başvurmanız gerekir; başvurunuz reddedilir, yanıtımızı yeterli bulmaz ya da 30 gün içinde yanıt alamazsanız Kişisel Verileri Koruma Kurulu’na şikâyette bulunabilirsiniz.',
      ],
    },
    // Only an online build has accounts at all.
    ...(online
      ? [
          {
            id: 'children',
            title: 'Çocuklar',
            blocks: [
              'Oyun hiçbir yaşta hesap gerektirmez. Giriş yapmak, Google ya da GitHub’ı kendi başına kullanabilecek yaştaki oyuncular içindir. Daha küçük oyuncular her şeyi giriş yapmadan oynayabilir.',
            ],
          },
        ]
      : []),
    {
      id: 'changes',
      title: 'Değişiklikler',
      blocks: ['Bu metin değiştiğinde en üstteki tarih de değişir.'],
    }
  );

  return {
    title: 'Gizlilik ve aydınlatma metni',
    updated: `Son güncelleme: ${dateIn('tr')}`,
    intro: [
      'Tick Perfect hesap açmadan oynanabilen bir oyundur. Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu (KVKK) ve AB Genel Veri Koruma Tüzüğü (GDPR) uyarınca oyunun hangi kişisel verileri, hangi amaçla ve hangi hukuki sebeple işlediğini ve bu konudaki haklarınızı açıklar.',
    ],
    sections,
    back: 'Oyuna dön',
    languages: 'Dil',
  };
}

export const NOTICES: Readonly<
  Record<Language, (facts: NoticeFacts) => Notice>
> = { en: english, tr: turkish };
