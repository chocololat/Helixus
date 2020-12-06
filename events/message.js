const {
  Collection
} = require("discord.js");
const {
  permissions
} = require("../structures/Constants");
const cooldowns = new Collection();

module.exports = (bot, message) => {
  if (message.channel.type === 'dm' || !message.channel.viewable || message.author.bot) return;
  bot.db.query(`SELECT * FROM Prefixes WHERE guildID='${message.guild.id}'`, (err, prefixes) => {
    let prefix;
    if (err) bot.logger.error(err);

    if (!prefixes[0]) prefix = "am!"
    else prefix = prefixes[0].prefix;

    const prefixRegex = new RegExp(`^(<@!?${bot.user.id}>|am\!|${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})\\s*`);

    if (prefixRegex.test(message.content)) {
      const [, match] = message.content.match(prefixRegex);
      const args = message.content.slice(match.length).trim().split(/ +/g);
      const cmd = args.shift().toLowerCase();
      let command = bot.commands.get(cmd) || bot.aliases.get(cmd);

      if (command) {
        /* Owner Check */
        if (command.ownerOnly && message.author.id !== bot.config.ownerID) {
          return message.reply("This command is only accessible to bot owners!")
        }

        /* Permissions Check */
        let neededPermsBot = [];
        let neededPermsUser = [];

        command.userPermissions.forEach(uP => {
          if (!message.channel.permissionsFor(message.member).has(uP)) neededPermsUser.push(uP);
        })

        command.clientPermissions.forEach(uP => {
          if (!message.channel.permissionsFor(message.guild.me).has(uP)) neededPermsBot.push(uP);
        })

        if (neededPermsUser.length > 0) {
          return message.reply(`Missing USER Permissions: ${neededPermsUser.map((p) => `\`${permissions[`${p}`]}\``).join(", ")}`)
        }

        if (neededPermsBot.length > 0) {
          return message.reply(`Missing BOT Permissions: ${neededPermsBot.map((p) => `\`${permissions[`${p}`]}\``).join(", ")}`)
        }

        /* Cooldowns */
        if (!cooldowns.has(command.name)) {
          cooldowns.set(command.name, new Collection());
        }

        const now = Date.now();
        const timestamps = cooldowns.get(command.name);
        const cooldownAmount = command.cooldown;

        if (timestamps.has(message.author.id)) {
          const expirationTime = timestamps.get(message.author.id) + cooldownAmount;

          if (now < expirationTime) {
            const timeLeft = (expirationTime - now) / 1000;
            return message.reply(`Please wait ${timeLeft.toFixed(1)} seconds before using this command.`)
          }
        }

        timestamps.set(message.author.id, now);
        setTimeout(() => timestamps.delete(message.author.id), cooldownAmount);

        try {
          command.run(message, args);
        } catch (e) {
          bot.logger.error(e);
          return message.reply(`An error has occured.`)
        }

      }


    }

    /* Levels */

    function generateXP(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    bot.db.query(`SELECT * FROM LevelsConfig WHERE guildID='${message.guild.id}'`, (err, rows) => {
      if (rows[0]) {
        if (rows[0].activated === "true") {
          bot.db.query(`SELECT * FROM Cooldowns WHERE userID='${message.author.id}'`, (err, cRows) => {
            if (!cRows[0]) bot.db.query(`INSERT INTO Cooldowns (userID, guildID, active) VALUES ('${message.author.id}', '${message.guild.id}', 'true')`);
            else return setTimeout(() => {
              bot.db.query(`DELETE FROM Cooldowns WHERE userID='${message.author.id}'`);
            }, 60 * 1000);

            bot.db.query(`SELECT * FROM Levels WHERE guild='${message.guild.id}' AND user='${message.author.id}'`, (err, lRows) => {
              if (err) throw err;

              if (!lRows[0]) {
                bot.db.query(`INSERT INTO Levels (user, guild, points, level) VALUES ('${message.author.id}', '${message.guild.id}', '${generateXP(5, 15)}', '1')`);
              } else {
                let xp;
                if (!lRows[0]) xp = 0;
                else xp = Number(lRows[0].points);
                bot.db.query(`UPDATE Levels SET points = '${lRows[0].points + generateXP(5, 15)}' WHERE guild='${message.guild.id}' AND user='${message.author.id}'`);
              }
            })
          })
        }
      }
    })

    bot.db.query(`SELECT * FROM LevelsConfig WHERE guildID='${message.guild.id}'`, (err, rows) => {
      if (rows[0]) {
        if (rows[0].activated === "true") {
          bot.db.query(`SELECT * FROM Cooldowns WHERE userID='${message.author.id}' AND guildID='${message.guild.id}'`, (err, cRows) => {
            if (!cRows[0]) bot.db.query(`INSERT INTO Cooldowns (userID, guildID, active) VALUES ('${message.author.id}', '${message.guild.id}', 'true')`);
            setTimeout(() => {
              bot.db.query(`DELETE FROM Cooldowns WHERE userID='${message.author.id}' AND guildID='${message.guild.id}'`);
            }, 60 * 1000);
          })

          bot.db.query(`SELECT * FROM Levels WHERE guild='${message.guild.id}' AND user='${message.author.id}'`, (err, lRows) => {
            var channel;
            var lvlupMsg;

            if (!lRows[0]) return;
            if (!Number(lRows[0].points)) return;
            const clvl = (5 * (lRows[0].level ^ 2) + 50 * lRows[0].level + 100) * 1.20;

            if (Number(lRows[0].points) > clvl) {
              bot.db.query(`UPDATE Levels SET level = '${Number(lRows[0].level) + 1}', points = '0' WHERE guild='${message.guild.id}' AND user='${message.author.id}'`);

              if (!rows[0].lvlupChannelID || rows[0].lvlupChannelID === "msgChannel") channel = message.channel.id;
              else channel = rows[0].lvlupChannelID;

              if (!rows[0].lvlupMessage) lvlupMsg = "Congratulations {user}, you are now level **{level}** !";
              else lvlupMsg = rows[0].lvlupMessage;

              bot.db.query(`SELECT * FROM LevelsRewards WHERE guildID='${message.guild.id}' AND level='${lRows[0].level + 1}'`, (err, rRows) => {
                if (rRows[0]) {
                  const role = message.guild.roles.resolve(rRows[0].roleID);
                  if (!message.member.roles.cache.has(role)) message.member.roles.add(role);
                }
              });
              for (let i = 0; i < Number(lRows[0].level); i++) {
                bot.db.query(`SELECT * FROM LevelsRewards WHERE guildID='${message.guild.id}' AND level='${i + 1}'`, (err, rRows) => {
                  if (rRows[0]) {
                    const role = message.guild.roles.resolve(rRows[0].roleID);
                    if (!message.member.roles.cache.has(role)) message.member.roles.add(role);
                  }
                });
              }

              if (!channel) channel = message.channel.id;
              if (!lvlupMsg) lvlupMsg = "Congratulations {user}, you are now level **{level}** !";

              const res = lvlupMsg.replace(/{user}/g, message.author).replace(/{level}/g, Number(lRows[0].level + 1));

              let chan = bot.channels.cache.get(channel);
              if (!chan) return;
              chan.send(res).catch(() => {});
            }
          })
        }
      }
    })
    bot.db.query(`SELECT * FROM Economy WHERE userID='${message.author.id}'`, (err, rows) => {
      bot.db.query(`SELECT * FROM Cooldowns WHERE userID='${message.author.id}' AND type='coins'`, (err, cools) => {
        if (!cools[0]) bot.db.query(`INSERT INTO Cooldowns (userID, guildID, active, type) VALUES ('${message.author.id}', '${message.guild.id}', 'true', 'coins')`);
        else return setTimeout(() => {
          bot.db.query(`DELETE FROM Cooldowns WHERE userID='${message.author.id}' AND type='coins'`);
        }, 60 * 1000);

        if (!rows[0]) {
          bot.db.query(`INSERT INTO Economy (userID, balance) VALUES ('${message.author.id}', '${message.guild.id}', '${generateXP(5, 15)}', '1')`);
        } else {
          bot.db.query(`UPDATE Economy SET balance = '${rows[0].balance + generateXP(5, 15)}' WHERE userID='${message.author.id}'`);
        }
      })
    })
  })
}