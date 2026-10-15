const T = {
    not_registered: {
        en: '❌ You must register first.\nType *.register <username> <age> <province>*',
        id: '❌ Kamu harus registrasi dulu.\nKetik *.register <username> <umur> <provinsi>*',
    },
    already_started: {
        en: '❌ You already have a character.\nUse *.profile* to view it.',
        id: '❌ Kamu sudah punya karakter.\nPakai *.profile* untuk melihatnya.',
    },
    no_character: {
        en: '❌ You don\'t have a character yet.\nType *.start <class> <lang>* to begin.\nExample: *.start swordman id*',
        id: '❌ Kamu belum punya karakter.\nKetik *.start <class> <lang>* untuk mulai.\nContoh: *.start swordman id*',
    },
    invalid_class: {
        en: '❌ Invalid class.\nAvailable: *swordman*, *mage*, *archer*, *guardian*',
        id: '❌ Class tidak valid.\nTersedia: *swordman*, *mage*, *archer*, *guardian*',
    },
    invalid_lang: {
        en: '❌ Language must be *en* or *id*.',
        id: '❌ Bahasa harus *en* atau *id*.',
    },
    lang_changed: {
        en: '✅ RPG language set to *English*.',
        id: '✅ Bahasa RPG diganti ke *Indonesia*.',
    },
    start_success: {
        en: (name, cls, aether) =>
            `🎉 *Character Created!*\n\n` +
            `👤 Name: *${name}*\n` +
            `⚔️ Class: *${cls}*\n` +
            `📊 Level: *1*\n` +
            `💰 Starting gold: *${aether}*\n\n` +
            `Type *.profile* to see your status.\n` +
            `Type *.daily* to claim daily Aether.\n` +
            `Type *.hunt* to fight monsters.`,
        id: (name, cls, aether) =>
            `🎉 *Karakter Berhasil Dibuat!*\n\n` +
            `👤 Nama: *${name}*\n` +
            `⚔️ Class: *${cls}*\n` +
            `📊 Level: *1*\n` +
            `💰 Modal awal: *${aether}*\n\n` +
            `Ketik *.profile* untuk lihat status.\n` +
            `Ketik *.daily* untuk klaim Aether harian.\n` +
            `Ketik *.hunt* untuk lawan monster.`,
    },
    daily_claimed: {
        en: (amount, total) =>
            `✅ Daily reward claimed!\n\n` +
            `💰 +${amount}\n` +
            `🏦 Balance: *${total}*`,
        id: (amount, total) =>
            `✅ Hadiah harian diklaim!\n\n` +
            `💰 +${amount}\n` +
            `🏦 Saldo: *${total}*`,
    },
    daily_already: {
        en: (left) => `⏳ You already claimed today.\nCome back in *${left}*.`,
        id: (left) => `⏳ Kamu sudah klaim hari ini.\nKembali lagi dalam *${left}*.`,
    },
    balance: {
        en: (amount) => `💰 Your Aether: *${amount}*`,
        id: (amount) => `💰 Aether kamu: *${amount}*`,
    },
    profile_title: {
        en: '📜 Character Profile',
        id: '📜 Profil Karakter',
    },
    hunt_busy: {
        en: '⏳ You are already hunting. Please wait.',
        id: '⏳ Kamu sedang berburu. Tunggu dulu.',
    },
    hunt_cooldown: {
        en: (left) => `⏳ Hunt cooldown.\nWait *${left}* before hunting again.`,
        id: (left) => `⏳ Cooldown berburu.\nTunggu *${left}* sebelum hunt lagi.`,
    },
    hunt_too_weak: {
        en: (name, min) => `❌ Too weak for *${name}*.\nRequired level: *${min}*+`,
        id: (name, min) => `❌ Terlalu lemah untuk *${name}*.\nLevel minimal: *${min}*+`,
    },
    hunt_search: {
        en: '🔍 Searching for monsters...',
        id: '🔍 Mencari monster...',
    },
    hunt_found: {
        en: (emoji, name, hp) => `${emoji} Found *${name}*!\nHP: ${hp}\n⚔️ Engaging...`,
        id: (emoji, name, hp) => `${emoji} Menemukan *${name}*!\nHP: ${hp}\n⚔️ Bertarung...`,
    },
    hunt_fighting: {
        en: (turn, pHp, mHp) => `⚔️ Turn ${turn}\n❤️ You: ${pHp}\n👾 Enemy: ${mHp}`,
        id: (turn, pHp, mHp) => `⚔️ Giliran ${turn}\n❤️ Kamu: ${pHp}\n👾 Musuh: ${mHp}`,
    },
    hunt_win: {
        en: (emoji, name, exp, aether, turns) =>
            `🏆 *Victory!*\n\n` +
            `${emoji} Defeated *${name}*\n` +
            `✨ EXP +${exp}\n` +
            `💰 +${aether}\n` +
            `🔄 Turns: ${turns}`,
        id: (emoji, name, exp, aether, turns) =>
            `🏆 *Menang!*\n\n` +
            `${emoji} Mengalahkan *${name}*\n` +
            `✨ EXP +${exp}\n` +
            `💰 +${aether}\n` +
            `🔄 Giliran: ${turns}`,
    },
    hunt_lose: {
        en: (emoji, name, exp) =>
            `💀 *Defeated...*\n\n` +
            `${emoji} Lost to *${name}*\n` +
            `✨ Consolation EXP +${exp}\n` +
            `Rest and try again.`,
        id: (emoji, name, exp) =>
            `💀 *Kalah...*\n\n` +
            `${emoji} Kalah dari *${name}*\n` +
            `✨ EXP penghibur +${exp}\n` +
            `Istirahat dulu, coba lagi.`,
    },
    hunt_flee: {
        en: (emoji, name, exp) =>
            `🏃 *Stalemate*\n\n` +
            `${emoji} Could not finish *${name}*\n` +
            `✨ EXP +${exp}`,
        id: (emoji, name, exp) =>
            `🏃 *Seri*\n\n` +
            `${emoji} Tidak berhasil kalahkan *${name}*\n` +
            `✨ EXP +${exp}`,
    },
    level_up_caption: {
        en: (oldL, newL) => `🎉 Level Up! ${oldL} → ${newL}`,
        id: (oldL, newL) => `🎉 Naik Level! ${oldL} → ${newL}`,
    },
    inv_title: {
        en: '🎒 Inventory',
        id: '🎒 Inventory',
    },
    inv_slots: {
        en: (used, max) => `Slots: ${used}/${max}`,
        id: (used, max) => `Slot: ${used}/${max}`,
    },
    equip_ok: {
        en: (name, slot) => `✅ Equipped *${name}* (${slot})`,
        id: (name, slot) => `✅ Memakai *${name}* (${slot})`,
    },
    unequip_ok: {
        en: (name, slot) => `✅ Unequipped *${name}* from ${slot}`,
        id: (name, slot) => `✅ Melepas *${name}* dari ${slot}`,
    },
    equip_need_id: {
        en: '❌ Specify item id.\nExample: *.equip wooden_sword*',
        id: '❌ Sebutkan id item.\nContoh: *.equip wooden_sword*',
    },
    unequip_need_slot: {
        en: '❌ Specify slot: *weapon*, *armor*, or *accessory*\nExample: *.unequip weapon*',
        id: '❌ Sebutkan slot: *weapon*, *armor*, atau *accessory*\nContoh: *.unequip weapon*',
    },
    item_not_found: {
        en: '❌ Item not in inventory.',
        id: '❌ Item tidak ada di inventory.',
    },
    not_equipment: {
        en: '❌ That item cannot be equipped.',
        id: '❌ Item itu tidak bisa dipakai.',
    },
    level_too_low: {
        en: (req) => `❌ Requires level *${req}*.`,
        id: (req) => `❌ Butuh level *${req}*.`,
    },
    inv_full: {
        en: '❌ Inventory is full.',
        id: '❌ Inventory penuh.',
    },
    slot_empty: {
        en: '❌ That slot is empty.',
        id: '❌ Slot itu kosong.',
    },
    drop_line: {
        en: (list) => `🎁 Drop: ${list}`,
        id: (list) => `🎁 Drop: ${list}`,
    },
    shop_title: {
        en: '🏪 Aether Shop',
        id: '🏪 Toko Aether',
    },
    shop_footer: {
        en: '*.buy <id> [qty]*  ·  *.sell <id> [qty]*',
        id: '*.buy <id> [qty]*  ·  *.sell <id> [qty]*',
    },
    buy_ok: {
        en: (name, qty, price, bal) => `✅ Bought *${name}* x${qty}\n💰 -${price}\n🏦 Balance: *${bal}*`,
        id: (name, qty, price, bal) => `✅ Membeli *${name}* x${qty}\n💰 -${price}\n🏦 Saldo: *${bal}*`,
    },
    sell_ok: {
        en: (name, qty, gain, bal) => `✅ Sold *${name}* x${qty}\n💰 +${gain}\n🏦 Balance: *${bal}*`,
        id: (name, qty, gain, bal) => `✅ Menjual *${name}* x${qty}\n💰 +${gain}\n🏦 Saldo: *${bal}*`,
    },
    buy_need: {
        en: '❌ Usage: *.buy <item_id> [qty]*\nExample: *.buy wooden_sword 1*',
        id: '❌ Cara: *.buy <item_id> [qty]*\nContoh: *.buy wooden_sword 1*',
    },
    sell_need: {
        en: '❌ Usage: *.sell <item_id> [qty]*\nExample: *.sell wooden_sword*',
        id: '❌ Cara: *.sell <item_id> [qty]*\nContoh: *.sell wooden_sword*',
    },
    no_money: {
        en: (need, have) => `❌ Not enough Aether.\nNeed *${need}* · Have *${have}*`,
        id: (need, have) => `❌ Aether tidak cukup.\nButuh *${need}* · Punya *${have}*`,
    },
    not_for_sale: {
        en: '❌ That item is not sold in the shop.',
        id: '❌ Item itu tidak dijual di toko.',
    },
    pay_ok: {
        en: (amount, name) => `✅ Sent *${amount}* to *${name}*`,
        id: (amount, name) => `✅ Mengirim *${amount}* ke *${name}*`,
    },
    give_ok: {
        en: (name, qty, target) => `✅ Gave *${name}* x${qty} to *${target}*`,
        id: (name, qty, target) => `✅ Memberi *${name}* x${qty} ke *${target}*`,
    },
    pay_need: {
        en: '❌ Tag/reply someone and specify amount.\nExample: *.pay @user 100* or reply + *.pay 100*',
        id: '❌ Tag/reply seseorang dan sebutkan jumlah.\nContoh: *.pay @user 100* atau reply + *.pay 100*',
    },
    give_need: {
        en: '❌ Tag/reply + item id.\nExample: *.give @user wooden_sword* or reply + *.give wooden_sword*',
        id: '❌ Tag/reply + id item.\nContoh: *.give @user wooden_sword* atau reply + *.give wooden_sword*',
    },
    no_target: {
        en: '❌ Target not found. Tag, reply, or use their number.',
        id: '❌ Target tidak ditemukan. Tag, reply, atau pakai nomornya.',
    },
    target_no_rpg: {
        en: '❌ Target has no RPG character.',
        id: '❌ Target belum punya karakter RPG.',
    },
    self_trade: {
        en: '❌ You cannot trade with yourself.',
        id: '❌ Tidak bisa trade ke diri sendiri.',
    },
    target_full: {
        en: '❌ Target inventory is full.',
        id: '❌ Inventory target penuh.',
    },
    bad_amount: {
        en: '❌ Invalid amount.',
        id: '❌ Jumlah tidak valid.',
    },
    quest_title: {
        en: '📋 Daily Quests',
        id: '📋 Quest Harian',
    },
    quest_claim_ok: {
        en: (name, exp, ae) => `✅ Quest *${name}* claimed!\n✨ +${exp} EXP · 💰 +${ae}`,
        id: (name, exp, ae) => `✅ Quest *${name}* diklaim!\n✨ +${exp} EXP · 💰 +${ae}`,
    },
    quest_incomplete: {
        en: (p, t) => `❌ Not finished yet (${p}/${t})`,
        id: (p, t) => `❌ Belum selesai (${p}/${t})`,
    },
    quest_claimed: {
        en: '❌ Already claimed today.',
        id: '❌ Sudah diklaim hari ini.',
    },
    quest_need: {
        en: 'Usage: *.quest* or *.quest claim <id>*\nIds: hunt_3, hunt_10, earn_200, earn_500',
        id: 'Cara: *.quest* atau *.quest claim <id>*\nId: hunt_3, hunt_10, earn_200, earn_500',
    },
    party_created: {
        en: '✅ Party created! Invite with *.party invite @user*',
        id: '✅ Party dibuat! Undang dengan *.party invite @user*',
    },
    party_in: {
        en: '❌ You are already in a party.',
        id: '❌ Kamu sudah dalam party.',
    },
    party_no: {
        en: '❌ You are not in a party.',
        id: '❌ Kamu tidak dalam party.',
    },
    party_invited: {
        en: (name) => `✅ Invited *${name}* to the party.`,
        id: (name) => `✅ Mengundang *${name}* ke party.`,
    },
    party_accepted: {
        en: '✅ Joined the party!',
        id: '✅ Bergabung ke party!',
    },
    party_left: {
        en: '✅ Left the party.',
        id: '✅ Keluar dari party.',
    },
    party_full: {
        en: '❌ Party is full (max 4).',
        id: '❌ Party penuh (maks 4).',
    },
    party_not_leader: {
        en: '❌ Only the leader can invite.',
        id: '❌ Hanya leader yang bisa undang.',
    },
    party_no_invite: {
        en: '❌ No pending party invite.',
        id: '❌ Tidak ada undangan party.',
    },
    guild_created: {
        en: (name, cost) => `✅ Guild *${name}* created! (-${cost})`,
        id: (name, cost) => `✅ Guild *${name}* dibuat! (-${cost})`,
    },
    guild_joined: {
        en: (name) => `✅ Joined guild *${name}*!`,
        id: (name) => `✅ Bergabung ke guild *${name}*!`,
    },
    guild_left: {
        en: '✅ Left the guild.',
        id: '✅ Keluar dari guild.',
    },
    guild_in: {
        en: '❌ You are already in a guild.',
        id: '❌ Kamu sudah dalam guild.',
    },
    guild_no: {
        en: '❌ You are not in a guild.',
        id: '❌ Kamu tidak dalam guild.',
    },
    guild_bad_name: {
        en: '❌ Guild name 3–20 chars (letters, numbers, space, - _).',
        id: '❌ Nama guild 3–20 karakter (huruf, angka, spasi, - _).',
    },
    guild_taken: {
        en: '❌ That guild name is taken.',
        id: '❌ Nama guild sudah dipakai.',
    },
    guild_not_found: {
        en: '❌ Guild not found.',
        id: '❌ Guild tidak ditemukan.',
    },
    guild_full: {
        en: '❌ Guild is full.',
        id: '❌ Guild penuh.',
    },
    guild_need_name: {
        en: '❌ Usage: *.guild create <name>* or *.guild join <name>*',
        id: '❌ Cara: *.guild create <nama>* atau *.guild join <nama>*',
    },
    bank_title: {
        en: '🏦 Bank',
        id: '🏦 Bank',
    },
    bank_status: {
        en: (wallet, bank) => `👛 Wallet: *${wallet}*\n🏦 Bank: *${bank}*`,
        id: (wallet, bank) => `👛 Dompet: *${wallet}*\n🏦 Bank: *${bank}*`,
    },
    bank_deposit_ok: {
        en: (amt, wallet, bank) => `✅ Deposited *${amt}*\n👛 Wallet: *${wallet}*\n🏦 Bank: *${bank}*`,
        id: (amt, wallet, bank) => `✅ Menabung *${amt}*\n👛 Dompet: *${wallet}*\n🏦 Bank: *${bank}*`,
    },
    bank_withdraw_ok: {
        en: (amt, wallet, bank) => `✅ Withdrew *${amt}*\n👛 Wallet: *${wallet}*\n🏦 Bank: *${bank}*`,
        id: (amt, wallet, bank) => `✅ Menarik *${amt}*\n👛 Dompet: *${wallet}*\n🏦 Bank: *${bank}*`,
    },
    bank_help: {
        en: '*.bank* — status\n*.bank deposit <amt|all>*\n*.bank withdraw <amt|all>*',
        id: '*.bank* — status\n*.bank deposit <jml|all>*\n*.bank withdraw <jml|all>*',
    },
    bank_min: {
        en: (min) => `❌ Minimum *${min}*`,
        id: (min) => `❌ Minimal *${min}*`,
    },
    bank_full: {
        en: (max) => `❌ Bank full (max *${max}*)`,
        id: (max) => `❌ Bank penuh (maks *${max}*)`,
    },
    bank_no: {
        en: (have) => `❌ Not enough in bank (*${have}*)`,
        id: (have) => `❌ Saldo bank tidak cukup (*${have}*)`,
    },
    gamble_help: {
        en: '*.judi coin <bet> <head|tail>*\nMin 10Æ · Max 500Æ · Win ×1.9\nCooldown only — bank is safe',
        id: '*.judi coin <taruhan> <angka|gambar>*\nMin 10Æ · Maks 500Æ · Menang ×1.9\nHanya dari dompet — bank aman',
    },
    gamble_cd: {
        en: (left) => `⏳ Gamble cooldown *${left}*`,
        id: (left) => `⏳ Cooldown judi *${left}*`,
    },
    gamble_win: {
        en: (pick, result, payout, wallet) => `🪙 *You win!*\nPick: ${pick} · Result: ${result}\n💰 +${payout}\n👛 Wallet: *${wallet}*`,
        id: (pick, result, payout, wallet) => `🪙 *Menang!*\nPilih: ${pick} · Hasil: ${result}\n💰 +${payout}\n👛 Dompet: *${wallet}*`,
    },
    gamble_lose: {
        en: (pick, result, amount, wallet) => `🪙 *You lose*\nPick: ${pick} · Result: ${result}\n💰 -${amount}\n👛 Wallet: *${wallet}*`,
        id: (pick, result, amount, wallet) => `🪙 *Kalah*\nPilih: ${pick} · Hasil: ${result}\n💰 -${amount}\n👛 Dompet: *${wallet}*`,
    },
    gamble_max: {
        en: (max) => `❌ Max bet *${max}*`,
        id: (max) => `❌ Taruhan maks *${max}*`,
    },
    gamble_bad_pick: {
        en: '❌ Pick *head* or *tail* (angka/gambar)',
        id: '❌ Pilih *angka* atau *gambar* (head/tail)',
    },
};

export function t(key, lang = 'id', ...args) {
    const entry = T[key];
    if (!entry) return key;
    const val = entry[lang] ?? entry.id ?? entry.en ?? key;
    if (typeof val === 'function') return val(...args);
    return val;
}

export function pickLang(raw) {
    const s = String(raw || '').toLowerCase().trim();
    if (s === 'en' || s === 'english' || s === 'inggris') return 'en';
    if (s === 'id' || s === 'indonesia' || s === 'indo') return 'id';
    return null;
}
