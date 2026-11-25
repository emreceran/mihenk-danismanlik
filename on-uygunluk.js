/* Mihenk — konkordato ön uygunluk testi. Mizan tarayıcıda okunur; dosya hiçbir sunucuya gönderilmez. */
(function () {
  "use strict";

  var $ = function (s) { return document.querySelector(s); };
  var tl = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });
  var ondalik = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var yuzde = new Intl.NumberFormat("tr-TR", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var son = null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function trSayi(v) {
    if (typeof v === "number") return v;
    var s = String(v || "").replace(/\s|₺|TL/g, "");
    var eksi = /^\(.*\)$/.test(s);
    s = s.replace(/[()]/g, "");
    if (/,\d{1,4}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
    var n = parseFloat(s);
    return isFinite(n) ? (eksi ? -n : n) : 0;
  }
  function M(n) { return tl.format(Math.round(n)) + " ₺"; }

  // ------------------------------------------------------------ Okuma
  function sutunBul(satirlar) {
    for (var i = 0; i < Math.min(satirlar.length, 25); i++) {
      var k = {};
      (satirlar[i] || []).forEach(function (h, j) {
        var t = String(h || "").toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
        if (!t) return;
        if (k.kod == null && /(hesap )?kod|hesap no|^hesap$/.test(t)) k.kod = j;
        else if (k.ad == null && /(hesap )?ad[ıi]|a[çc][ıi]klama|unvan/.test(t)) k.ad = j;
        else if (/bor[çc]/.test(t) && /bakiye/.test(t)) k.bb = j;
        else if (/alacak/.test(t) && /bakiye/.test(t)) k.ab = j;
        else if (/^bakiye$/.test(t)) k.bk = j;
        else if (/bor[çc]/.test(t) && k.b == null) k.b = j;
        else if (/alacak/.test(t) && k.a == null) k.a = j;
      });
      if (k.kod != null && ((k.bb != null && k.ab != null) || k.bk != null || (k.b != null && k.a != null))) return { bas: i, k: k };
    }
    return null;
  }

  function mizanOku(satirlar) {
    var b = sutunBul(satirlar);
    var hesap = {}, adlar = {}, anaVar = {};
    var kaynak = [];
    if (!b) {
      // Başlık bulunamazsa: ilk sütun kod, son iki sayısal sütun borç/alacak bakiye varsayılır
      satirlar.forEach(function (s) {
        var kod = String(s[0] || "").trim();
        if (!/^\d{3}/.test(kod)) return;
        var sayilar = s.slice(1).filter(function (v) { return v !== "" && isFinite(trSayi(v)) && /\d/.test(String(v)); });
        if (sayilar.length < 2) return;
        kaynak.push([kod, String(s[1] || ""), trSayi(sayilar[sayilar.length - 2]) - trSayi(sayilar[sayilar.length - 1])]);
      });
    } else {
      var k = b.k;
      for (var r = b.bas + 1; r < satirlar.length; r++) {
        var s = satirlar[r] || [];
        var kod = String(s[k.kod] || "").trim();
        if (!/^\d{3}/.test(kod)) continue;
        var bakiye;
        if (k.bb != null && k.ab != null) bakiye = trSayi(s[k.bb]) - trSayi(s[k.ab]);
        else if (k.bk != null) bakiye = trSayi(s[k.bk]);
        else bakiye = trSayi(s[k.b]) - trSayi(s[k.a]);
        kaynak.push([kod, k.ad != null ? String(s[k.ad] || "") : "", bakiye]);
      }
    }
    kaynak.forEach(function (x) { if (/^\d{3}$/.test(x[0].replace(/\s/g, ""))) anaVar[x[0].trim()] = 1; });
    kaynak.forEach(function (x) {
      var temiz = x[0].replace(/\s/g, "");
      var ana = temiz.slice(0, 3);
      var anaSatir = /^\d{3}$/.test(temiz);
      if (!anaSatir && anaVar[ana]) return;  // ana hesap satırı varsa alt kırılımlar çift sayılmasın
      hesap[ana] = (hesap[ana] || 0) + x[2];
      if (anaSatir || !adlar[ana]) adlar[ana] = x[1];
    });
    return { hesap: hesap, adlar: adlar, satir: kaynak.length };
  }

  // ------------------------------------------------------------ Analiz
  // Amaç: (1) işletme gerçekten mali sıkıntıda mı, (2) faaliyet konkordatoyu taşıyacak kadar canlı mı,
  // (3) kayıtlar komiser ve mahkeme incelemesine hazır mı? Kesin hüküm değil, ön göstergedir.
  function analiz(m, ay) {
    var h = m.hesap;
    var b = function (kod) { return h[kod] || 0; };
    var grup = function (on) {
      return Object.keys(h).reduce(function (t, k) { return k.indexOf(on) === 0 ? t + h[k] : t; }, 0);
    };
    var v = {};
    v.donen = grup("1"); v.duran = grup("2"); v.aktif = v.donen + v.duran;
    v.kvyk = -grup("3"); v.uvyk = -grup("4"); v.borc = v.kvyk + v.uvyk;
    v.sonuc = -(grup("6") + grup("7"));
    v.ozkaynak = -grup("5") + v.sonuc;
    v.sermaye = -b("500") - b("501");               // 501 ödenmemiş sermaye (borç bakiyeli) düşülür
    v.kanuniYedek = -b("540");
    v.hazir = grup("10"); v.kasa = b("100");
    v.ticAlacak = grup("12"); v.stok = grup("15");
    v.ortakAlacak = b("131") + b("231");
    v.maddi = ["250", "251", "252", "253", "254", "255", "256", "258"].reduce(function (t, k) { return t + b(k); }, 0);
    v.birikmis = -b("257");
    v.finBorc = -(grup("30") + grup("40"));
    v.ticBorc = -(grup("32") + grup("42"));
    v.kamuBorc = -(grup("36") + grup("46"));
    v.ortakBorc = -(b("331") + b("431"));
    v.personel = -b("335");
    v.netSatis = -(grup("60") + grup("61"));
    v.smm = grup("62");
    v.brut = v.netSatis - v.smm;
    v.faalKar = v.brut - grup("63");
    v.finGider = grup("66");
    v.vergiOncesi = -(["60", "61", "62", "63", "64", "65", "66", "67", "68"].reduce(function (t, g) { return t + grup(g); }, 0));
    v.toplam = Object.keys(h).reduce(function (t, k) { return t + h[k]; }, 0);
    var yillik = 12 / ay;

    var bolumler = [], uyarilar = [];
    function bolum(ad) { var o = { ad: ad, satirlar: [] }; bolumler.push(o); return o; }
    function satir(bl, ad, deger, durum, yorum) { bl.satirlar.push({ ad: ad, deger: deger, durum: durum, yorum: yorum }); }
    var bol = function (a, c) { return c ? a / c : null; };
    var puan = { sikinti: 0, canlilik: 0, kayit: 0 };

    // 1) Mali sıkıntı göstergeleri — konkordatoya ihtiyaç var mı?
    var S = bolum("1. Mali sıkıntı göstergeleri (konkordato ihtiyacı)");
    var esas = v.sermaye + v.kanuniYedek;
    var oz = esas > 0 ? v.ozkaynak / esas : null;
    var ttk;
    if (v.ozkaynak < 0) { ttk = ["Borca batık görünüm", "risk", "Özkaynak negatif: varlıklar borçları karşılamıyor görünüyor. TTK 376/3 kapsamında ara bilanço çıkarılması ve yönetim organının hızla harekete geçmesi gerekir; konkordato bu durumda iflasa alternatif yasal yollardandır."]; puan.sikinti += 3; }
    else if (oz != null && oz < 1 / 3) { ttk = ["Sermayenin 2/3'ü kayıp", "risk", "TTK 376/2: sermaye ve kanuni yedeklerin üçte ikisi karşılıksız kalmış görünüyor. Genel kurul sermayenin tamamlanmasına ya da üçte biriyle yetinilmesine karar vermezse şirket kendiliğinden sona erer."]; puan.sikinti += 2; }
    else if (oz != null && oz < 0.5) { ttk = ["Sermayenin yarısı kayıp", "dikkat", "TTK 376/1: sermaye ve kanuni yedeklerin yarısı karşılıksız kalmış görünüyor. Yönetim kurulunun genel kurulu toplayıp iyileştirici önlemleri sunması gerekir."]; puan.sikinti += 1; }
    else { ttk = ["Sermaye korunuyor", "iyi", "Özkaynak, sermaye ve kanuni yedeklerin yarısının üzerinde."]; }
    satir(S, "Özkaynak / sermaye (TTK 376)", M(v.ozkaynak) + (oz != null ? " · " + yuzde.format(oz) : ""), ttk[1], ttk[0] + ". " + ttk[2]);
    if (ttk[1] !== "iyi") uyarilar.push([ttk[1], ttk[0] + " — " + ttk[2]]);

    var cari = bol(v.donen, v.kvyk), nakit = bol(v.hazir, v.kvyk);
    satir(S, "Cari oran", cari == null ? "—" : ondalik.format(cari), cari == null ? "bilgi" : cari < 1 ? "risk" : cari < 1.3 ? "dikkat" : "iyi",
      "Dönen varlıkların bir yıl içinde ödenecek borçları karşılama gücü. 1'in altı, vadesi gelen borçların mevcut varlıklarla ödenemeyeceğini gösterir — konkordatonun en tipik nedeni budur.");
    if (cari != null && cari < 1) puan.sikinti += 2; else if (cari != null && cari < 1.3) puan.sikinti += 1;
    satir(S, "Nakit oranı", nakit == null ? "—" : ondalik.format(nakit), nakit == null ? "bilgi" : nakit < 0.05 ? "risk" : nakit < 0.15 ? "dikkat" : "iyi",
      "Kasa ve bankadaki paranın kısa vadeli borçlara oranı. Çok düşükse çek/senet ve kredi taksitleri günü gününe karşılanamıyor olabilir.");
    if (nakit != null && nakit < 0.05) puan.sikinti += 1;
    var kaldirac = bol(v.borc, v.aktif);
    satir(S, "Toplam borç / aktif", kaldirac == null ? "—" : yuzde.format(kaldirac), kaldirac == null ? "bilgi" : kaldirac > 0.85 ? "risk" : kaldirac > 0.7 ? "dikkat" : "iyi",
      "Varlıkların ne kadarının borçla finanse edildiği.");
    if (kaldirac != null && kaldirac > 0.85) puan.sikinti += 1;
    var faizYuku = v.faalKar > 0 ? v.finGider / v.faalKar : null;
    satir(S, "Finansman gideri / faaliyet kârı", v.faalKar <= 0 ? (v.finGider > 0 ? "Faaliyet kârı yok" : "—") : yuzde.format(faizYuku),
      v.faalKar <= 0 ? (v.finGider > 0 ? "risk" : "bilgi") : faizYuku > 1 ? "risk" : faizYuku > 0.5 ? "dikkat" : "iyi",
      "Faaliyetten kazanılanın ne kadarının faize gittiği. %100'ü aşıyorsa işletme borcunu çevirmek için yeni borç almak zorundadır.");
    if (v.faalKar > 0 && faizYuku > 1) puan.sikinti += 1;

    // 2) Faaliyetin sürdürülebilirliği — konkordato başarıya ulaşabilir mi?
    var C = bolum("2. Faaliyetin sürdürülebilirliği (başarı ihtimali)");
    satir(C, "Net satışlar", M(v.netSatis) + (ay !== 12 ? " (" + ay + " ay)" : ""), v.netSatis > 0 ? "iyi" : "risk",
      v.netSatis > 0 ? "İşletme faaliyetine devam ediyor. Konkordatoda ödeme planı, faaliyetten doğacak nakitle karşılanır." :
        "Satış görünmüyor. Faaliyeti durmuş bir işletmede konkordato projesinin gerçekçi bir ödeme kaynağı göstermesi çok zordur.");
    if (v.netSatis > 0) puan.canlilik += 2;
    var bm = bol(v.brut, v.netSatis);
    satir(C, "Brüt kâr marjı", bm == null ? "—" : yuzde.format(bm), bm == null ? "bilgi" : bm < 0 ? "risk" : bm < 0.08 ? "dikkat" : "iyi",
      "Ürün ya da hizmet maliyetinin üzerinde satılabiliyor mu? Pozitif brüt marj, sorunun ürün değil finansman yapısı olduğuna işaret eder.");
    if (bm != null && bm > 0) puan.canlilik += 1;
    var fm = bol(v.faalKar, v.netSatis);
    satir(C, "Faaliyet kârı", M(v.faalKar) + (fm != null ? " · " + yuzde.format(fm) : ""), v.faalKar > 0 ? "iyi" : "dikkat",
      v.faalKar > 0 ? "İşletme asıl işinden kâr ediyor; borç yükü hafifletildiğinde ayakta kalma ihtimali yüksektir." :
        "Faaliyet zararı var. Projede maliyet ve gider tarafında somut iyileştirme önlemleri gösterilmesi gerekir.");
    if (v.faalKar > 0) puan.canlilik += 2;
    var odeme = v.faalKar > 0 ? (v.borc - v.hazir) / (v.faalKar * yillik + 1e-9) : null;
    satir(C, "Net borç / yıllık faaliyet kârı", odeme == null ? "Hesaplanamıyor" : ondalik.format(odeme) + " yıl", odeme == null ? "dikkat" : odeme > 8 ? "risk" : odeme > 4 ? "dikkat" : "iyi",
      "Bugünkü faaliyet kârıyla borçların kaba olarak kaç yılda ödenebileceği. Ödeme planının vadesi ve olası indirim oranı bu göstergeyle birlikte kurulur.");
    if (odeme != null && odeme <= 8) puan.canlilik += 1;

    // Kaba iflas karşılaştırması
    var tasfiye = v.hazir + v.ticAlacak * 0.6 + v.stok * 0.45 + Math.max(0, v.maddi - v.birikmis) * 0.55;
    var karsilama = v.borc > 0 ? tasfiye / v.borc : null;
    satir(C, "İflas halinde kaba karşılama", karsilama == null ? "—" : yuzde.format(Math.min(karsilama, 9.99)), karsilama == null ? "bilgi" : karsilama < 1 ? "iyi" : "dikkat",
      "Varsayım: hazır değerler %100, ticari alacaklar %60, stok %45, net maddi varlıklar %55 değerle paraya çevrilir. Konkordato teklifinin, alacaklılara iflasta alacaklarından daha fazlasını sağlaması gerekir; oran ne kadar düşükse konkordatonun alacaklıya cazibesi o kadar yüksektir. Gerçek değerleme ekspertizle yapılır.");

    // 3) Borç yapısı — alacaklılar toplantısı ve ödeme planı açısından
    var D = bolum("3. Borç yapısı");
    var pay = function (x) { return v.borc > 0 ? " · " + yuzde.format(x / v.borc) : ""; };
    satir(D, "Banka ve finansal borçlar", M(v.finBorc) + pay(v.finBorc), "bilgi", "Kredi, leasing ve benzeri. Rehin ve ipotekle teminatlı kısım projede ayrıca ele alınır.");
    satir(D, "Ticari borçlar (satıcı, senet)", M(v.ticBorc) + pay(v.ticBorc), "bilgi", "Tedarikçiler. Alacaklılar toplantısında oy çoğunluğunu genellikle bu grup belirler; tedarik zincirinin devamı için ilişkinin korunması kritiktir.");
    var kamuPay = v.borc > 0 ? v.kamuBorc / v.borc : 0;
    satir(D, "Vergi ve SGK borçları", M(v.kamuBorc) + pay(v.kamuBorc), kamuPay > 0.25 ? "dikkat" : "bilgi",
      "Kamu alacakları konkordato ile indirime tabi tutulamaz; ödeme planında ayrıca ve tam olarak planlanmalıdır." + (kamuPay > 0.25 ? " Payı yüksek; proje nakit planında belirleyici olacaktır." : ""));
    if (kamuPay > 0.25) uyarilar.push(["dikkat", "Vergi ve SGK borçları toplam borcun " + yuzde.format(kamuPay) + "'i. Bu borçlar indirime konu olmaz; ödeme planı buna göre kurulmalı."]);
    if (v.ortakBorc > 0) satir(D, "Ortaklara borçlar", M(v.ortakBorc) + pay(v.ortakBorc), "bilgi", "Ortak ve ilişkili kişilerin alacakları toplantıda özel değerlendirmeye tabidir.");
    if (v.personel > 0) satir(D, "Personele borçlar", M(v.personel), "dikkat", "Ödenmemiş ücretler imtiyazlı alacaktır; faaliyetin sürmesi için öncelikle planlanmalıdır.");

    // 4) Kayıt ve belge hazırlığı — komiser ve mahkemenin ilk bakacağı yerler
    var K = bolum("4. Kayıt düzeni (komiser incelemesine hazırlık)");
    var denge = Math.abs(v.toplam) <= Math.max(1, Math.abs(v.aktif) * 0.0001);
    satir(K, "Mizan dengesi", denge ? "Borç = alacak" : "Fark: " + M(v.toplam), denge ? "iyi" : "dikkat",
      denge ? "Borç ve alacak toplamları eşit." : "Toplamlar tutmuyor; dosya eksik okunmuş ya da bazı hesaplar ayrıştırılamamış olabilir.");
    if (denge) puan.kayit += 1;
    if (v.ortakAlacak > 0) {
      var oo = v.aktif > 0 ? v.ortakAlacak / v.aktif : 0;
      var od = oo > 0.05 ? "risk" : oo > 0.02 ? "dikkat" : "iyi";
      satir(K, "Ortaklardan alacaklar", M(v.ortakAlacak) + " · aktifin " + yuzde.format(oo), od,
        "Mali sıkıntıdaki şirketten ortaklara aktarılmış para, komiser ve alacaklıların ilk sorguladığı kalemdir. Tahsil planı ya da açıklaması projede yer almalıdır.");
      if (od !== "iyi") uyarilar.push([od, "Ortaklardan alacaklar " + M(v.ortakAlacak) + ". Projede tahsil edilecekleri ya da nedenleri açıkça gösterilmeli."]); else puan.kayit += 1;
    } else { satir(K, "Ortaklardan alacaklar", "Yok", "iyi", ""); puan.kayit += 1; }
    if (v.kasa < 0) { satir(K, "Kasa", M(v.kasa), "risk", "Kasa eksi bakiye veriyor; kayıt hatası vardır."); uyarilar.push(["risk", "Kasa hesabı eksi bakiye veriyor; başvurudan önce düzeltilmeli."]); }
    else {
      var aylik = v.netSatis / ay, kasaY = aylik > 0 && v.kasa > aylik * 0.1;
      satir(K, "Kasa", M(v.kasa), kasaY ? "dikkat" : "iyi", kasaY ? "Kasa bakiyesi aylık satışların %10'unu aşıyor. Fiili sayımla tutmuyorsa komiser bunu açıklanmamış nakit çıkışı olarak değerlendirebilir." : "Makul düzeyde.");
      if (!kasaY) puan.kayit += 1; else uyarilar.push(["dikkat", "Kasa bakiyesi yüksek (" + M(v.kasa) + "); fiili sayımla karşılaştırılmalı."]);
    }
    if (v.maddi > 0) {
      var am = v.birikmis <= 0 ? "risk" : "iyi";
      satir(K, "Amortisman", v.birikmis <= 0 ? "Ayrılmamış" : M(v.birikmis), am, v.birikmis <= 0 ? "Birikmiş amortisman görünmüyor; varlıklar ve özkaynak olduğundan yüksek görünür, gerçek durum daha ağır olabilir." : "Ayrılmış.");
      if (am === "iyi") puan.kayit += 1;
    }

    // Genel sonuç
    var g;
    if (v.netSatis <= 0) g = ["risk", "Faaliyet görünmüyor", "Mizanda satış görünmüyor. Konkordato, faaliyetine devam eden ve ödeme planını faaliyetinden karşılayabilecek işletmeler içindir. Durumu birlikte değerlendirelim; başka yasal yollar daha uygun olabilir."];
    else if (puan.sikinti >= 2 && puan.canlilik >= 4) g = ["iyi", "Konkordato için güçlü ön görünüm", "Mali sıkıntı belirgin, buna karşın işletme satış yapıyor ve asıl faaliyetinden kâr ediyor. Bu tablo, borç yükü yeniden yapılandırıldığında ayakta kalabilecek işletmelerde görülür. Detaylı uygunluk raporu için mizanınızı bize gönderin."];
    else if (puan.sikinti >= 2) g = ["dikkat", "Mali sıkıntı var, faaliyet tarafı güçlendirilmeli", "Borç yükü ağır; ancak faaliyet kârlılığı zayıf. Konkordato projesinin, gider ve maliyet tarafında somut iyileştirme önlemleriyle kurulması gerekir. Uygunluk ayrıntılı inceleme ister."];
    else if (puan.sikinti === 1) g = ["dikkat", "Erken uyarı aşaması", "Bazı göstergeler sıkışmaya işaret ediyor. Bu aşamada borç yapılandırması, alacaklılarla uzlaşma ya da nakit planı konkordatoya gerek bırakmadan çözüm olabilir; erken davranmak en geniş seçeneği sağlar."];
    else g = ["iyi", "Belirgin mali sıkıntı görünmüyor", "Mizana göre konkordato gerektiren bir tablo görünmüyor. Yine de vadesi gelmiş ödemelerde sıkışıklık yaşıyorsanız sorun nakit akışında olabilir; birlikte bakabiliriz."];

    return { v: v, bolumler: bolumler, uyarilar: uyarilar, genel: g, puan: puan, karsilama: karsilama, cari: cari };
  }

  // ------------------------------------------------------------ Gösterim
  var ETIKET = { iyi: "Olumlu", dikkat: "Dikkat", risk: "Risk", bilgi: "Bilgi" };
  function goster(m, kaynakAdi) {
    var ay = parseInt($("#ay").value, 10) || 12;
    var s = analiz(m, ay), v = s.v;
    son = { m: m, ad: kaynakAdi };
    $("#sonuc").hidden = false;
    $("#kaynak").textContent = kaynakAdi + " · " + Object.keys(m.hesap).length + " ana hesap · " + ay + " aylık dönem";
    $("#genel").className = "genel d-" + s.genel[0];
    $("#genel").innerHTML = "<h3>" + esc(s.genel[1]) + "</h3><p>" + esc(s.genel[2]) + "</p>";
    var seviye = function (p, esik) { return p >= esik[0] ? esik[1] : p >= esik[2] ? esik[3] : esik[4]; };
    $("#karar").innerHTML = [
      ["Mali sıkıntı", seviye(s.puan.sikinti, [3, "Belirgin", 1, "Başlangıç", "Düşük"]), "Konkordatoya ihtiyacı gösteren likidite, sermaye ve borç göstergeleri."],
      ["Faaliyet gücü", seviye(s.puan.canlilik, [5, "Güçlü", 3, "Orta", "Zayıf"]), "Ödeme planını taşıyacak satış ve faaliyet kârı."],
      ["Kayıt düzeni", seviye(s.puan.kayit, [4, "Hazır", 2, "Düzeltme gerekli", "Ciddi eksik"]), "Komiser incelemesinde ilk bakılan kalemler."]
    ].map(function (x) { return '<div><span class="baslik">' + x[0] + '</span><div class="deger">' + x[1] + "</div><p>" + x[2] + "</p></div>"; }).join("");
    $("#ana-rakam").innerHTML = [["Aktif toplamı", M(v.aktif)], ["Toplam borç", M(v.borc)], ["Özkaynak", M(v.ozkaynak)],
      ["Net satışlar", M(v.netSatis)], ["Faaliyet kârı", M(v.faalKar)]].map(function (x) {
        return "<div><span>" + x[0] + "</span><strong" + (/^-/.test(x[1]) ? ' class="kirmizi"' : "") + ">" + x[1] + "</strong></div>";
      }).join("");
    $("#uyarilar").innerHTML = s.uyarilar.length ? "<h3>Öne çıkan bulgular</h3><ul>" + s.uyarilar.map(function (u) {
      return '<li class="d-' + u[0] + '">' + esc(u[1]) + "</li>";
    }).join("") + "</ul>" : "";
    $("#bolumler").innerHTML = s.bolumler.map(function (b) {
      return '<section class="rontgen-bolum"><h3>' + esc(b.ad) + "</h3>" + b.satirlar.map(function (r) {
        return '<div class="r-satir"><div class="r-ad">' + esc(r.ad) + '</div><div class="r-deger">' + esc(r.deger) +
          '</div><div class="r-durum d-' + r.durum + '">' + ETIKET[r.durum] + '</div><div class="r-yorum">' + esc(r.yorum) + "</div></div>";
      }).join("") + "</section>";
    }).join("");
    $("#sonuc").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function dosyaOku(d) {
    if (!window.XLSX) { alert("Excel kütüphanesi yüklenemedi; sayfayı yenileyip tekrar deneyin."); return; }
    $("#dosya-durum").textContent = d.name + " okunuyor…";
    d.arrayBuffer().then(function (buf) {
      var wb = XLSX.read(buf, { type: "array" });
      var enIyi = null;
      wb.SheetNames.forEach(function (ad) {
        var m = mizanOku(XLSX.utils.sheet_to_json(wb.Sheets[ad], { header: 1, raw: true, defval: "" }));
        if (!enIyi || Object.keys(m.hesap).length > Object.keys(enIyi.hesap).length) enIyi = m;
      });
      if (!enIyi || Object.keys(enIyi.hesap).length < 5) {
        $("#dosya-durum").textContent = "Dosyada mizan bulunamadı.";
        alert("Dosyada hesap kodu ve borç/alacak bakiyesi sütunları bulunamadı. Başlık satırında 'Hesap Kodu', 'Borç Bakiye' ve 'Alacak Bakiye' (ya da 'Borç' ve 'Alacak') geçmelidir.");
        return;
      }
      $("#dosya-durum").textContent = d.name + " okundu.";
      goster(enIyi, d.name);
    }).catch(function () { $("#dosya-durum").textContent = "Dosya okunamadı."; });
  }

  // ------------------------------------------------------------ Örnek (kurgusal, 9 aylık, sıkışmış ama faal üretici)
  var ORNEK = [
    ["Hesap Kodu", "Hesap Adı", "Borç Bakiye", "Alacak Bakiye"],
    ["100", "Kasa", 380000, 0], ["102", "Bankalar", 620000, 0], ["120", "Alıcılar", 21400000, 0],
    ["121", "Alacak Senetleri", 3600000, 0], ["131", "Ortaklardan Alacaklar", 2900000, 0], ["150", "İlk Madde ve Malzeme", 9800000, 0],
    ["152", "Mamuller", 5200000, 0], ["190", "Devreden KDV", 2100000, 0],
    ["252", "Binalar", 12000000, 0], ["253", "Tesis, Makine ve Cihazlar", 19500000, 0], ["254", "Taşıtlar", 2600000, 0],
    ["257", "Birikmiş Amortismanlar", 0, 11200000],
    ["300", "Banka Kredileri", 0, 23200000], ["320", "Satıcılar", 0, 19800000], ["321", "Borç Senetleri", 0, 6400000],
    ["335", "Personele Borçlar", 0, 1300000], ["360", "Ödenecek Vergi ve Fonlar", 0, 2700000], ["361", "Ödenecek Sosyal Güvenlik Kesintileri", 0, 2900000],
    ["400", "Banka Kredileri", 0, 9600000], ["500", "Sermaye", 0, 12000000], ["580", "Geçmiş Yıllar Zararları", 5600000, 0],
    ["600", "Yurtiçi Satışlar", 0, 58000000], ["601", "Yurtdışı Satışlar", 0, 6500000], ["610", "Satıştan İadeler", 1100000, 0],
    ["620", "Satılan Mamuller Maliyeti", 50300000, 0], ["631", "Pazarlama Satış ve Dağıtım Giderleri", 2300000, 0],
    ["632", "Genel Yönetim Giderleri", 4600000, 0], ["646", "Kambiyo Kârları", 0, 900000],
    ["656", "Kambiyo Zararları", 1400000, 0], ["660", "Kısa Vadeli Borçlanma Giderleri", 9100000, 0]
  ];

  document.addEventListener("DOMContentLoaded", function () {
    var alan = $("#yukle"), girdi = $("#dosya");
    if (!alan) return;
    girdi.addEventListener("change", function () { if (girdi.files[0]) dosyaOku(girdi.files[0]); });
    ["dragenter", "dragover"].forEach(function (o) { alan.addEventListener(o, function (e) { e.preventDefault(); alan.classList.add("ustunde"); }); });
    ["dragleave", "drop"].forEach(function (o) { alan.addEventListener(o, function (e) { e.preventDefault(); alan.classList.remove("ustunde"); }); });
    alan.addEventListener("drop", function (e) { if (e.dataTransfer.files[0]) dosyaOku(e.dataTransfer.files[0]); });
    $("#ornek").addEventListener("click", function () {
      $("#ay").value = "9";
      $("#dosya-durum").textContent = "Örnek mizan yüklendi (kurgusal, 9 aylık).";
      goster(mizanOku(ORNEK), "Örnek mizan");
    });
    $("#ay").addEventListener("change", function () { if (son) goster(son.m, son.ad); });
    $("#yazdir").addEventListener("click", function () { window.print(); });
    if (/[?&]ornek=1/.test(location.search)) $("#ornek").click();
  });
})();
