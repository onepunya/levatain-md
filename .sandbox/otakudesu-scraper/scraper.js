const axios = require("axios");
const cheerio = require("cheerio");

async function scrapeOtakudesuOngoing() {
    try {
        const { data } = await axios.get("https://otakudesu.blog/ongoing-anime/", {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            }
        });
        const $ = cheerio.load(data);
        const animeList = [];

        $(".venz ul li").each((_, element) => {
            const title = $(element).find(".detdesc h2").text().trim() || $(element).find(".jdlz").text().trim();
            const url = $(element).find("a").attr("href");
            const thumb = $(element).find("img").attr("src");
            const episode = $(element).find(".epz").text().trim();
            const released = $(element).find(".neweps").text().trim();

            if (title) {
                animeList.push({ title, episode, released, url, thumb });
            }
        });

        console.log(JSON.stringify(animeList, null, 2));
    } catch (error) {
        console.error("Gagal scrape Otakudesu:", error.message);
    }
}

scrapeOtakudesuOngoing();
