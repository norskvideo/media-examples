InkDrop.ts from https://www.pexels.com/video/multi-colored-vapor-1943483/
Weaving.ts from https://www.pexels.com/video/the-art-of-weaving-2121158/
TraditionalMusic.mp4  https://www.pexels.com/video/a-man-playing-a-traditional-musical-instrument-of-india-3468587/ 

converted to web-rtc friendly format with:

$FFMPEG_FULL/bin/ffmpeg -stream_loop -1 -i ~/Downloads/pexels-antonio-jose-meza-c%C3%A1rdenas-2121158-1920x1080-24fps.mp4 -filter:v fps=25 -s 1280x720 -vcodec h264 -profile:v baseline -frames:v 1600 -x264opts "keyint=25:min-keyint=25:no-scenecut:bframes=0:force-cfr=1" -preset medium -frames:a 3125 -acodec aac workspaces/media-examples/data/Weaving.ts

Made stereo with

$FFMPEG_FULL/bin/ffmpeg -i Weaving.ts -acodec aac -ac 2 -c:v copy Weaving-stereo.ts

$FFMPEG_FULL/bin/ffmpeg -i TraditionalMusicOrg.ts -filter:v fps=25 -s 720x1280 -vcodec h264 -profile:v baseline -x264opts "keyint=25:min-keyint=25:no-scenecut:bframes=0:force-cfr=1" -preset medium -frames:a 3125 -acodec copy -t 40 workspaces/media-examples/data/TraditionalMusic.mp4