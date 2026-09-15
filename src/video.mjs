import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run = promisify(execFile);
export const VIDEO_EXT = ['.mp4', '.mov', '.m4v'];

// Fixed 15-second, silent, SDR-compatible output. Short clips loop.
export async function composeVideo(source, overlay, output) {
  await run('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-stream_loop', '-1', '-i', source,
    '-loop', '1', '-framerate', '30', '-i', overlay,
    '-filter_complex',
    '[0:v:0]fps=30,scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,setpts=PTS-STARTPTS[bg];[bg][1:v:0]overlay=0:0:format=auto,format=yuv420p[v]',
    '-map', '[v]', '-an', '-t', '15',
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
    '-maxrate', '4M', '-bufsize', '8M', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-threads', '2', '-filter_complex_threads', '1', output
  ], { timeout: 180000, maxBuffer: 1024 * 1024 });
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y',
    '-i', output, '-frames:v', '1', output.replace(/\.mp4$/, '.preview.png')
  ], { timeout: 30000, maxBuffer: 1024 * 1024 });
}
