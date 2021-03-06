const {
    MessageEmbed
} = require("discord.js");
const Command = require("../../structures/Command");

module.exports = class ResumeCommand extends Command {
    constructor(bot) {
        super(bot, {
            name: 'resume',
            description: 'Resumes the musics that its currently playing.',
            usage: "resume",
            type: 'music'
        });
    }

    async run(message) {
        const queue = this.bot.queue.get(message.guild.id);
        if (!queue) return message.reply(message.guild.lang.COMMANDS.RESUME.noQueue).catch(console.error);
        if (queue && message.member.voice.channel !== message.guild.me.voice.channel) return message.reply(message.guild.lang.COMMANDS.PLAY.notSameVoiceChannel)
        
        if (!queue.playing) {
            queue.playing = true;
            queue.connection.dispatcher.resume();
            return queue.textChannel.send(message.guild.lang.COMMANDS.RESUME.success(message.author)).catch(console.error);
        }
    }
}