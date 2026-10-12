# Tiles out/stills/t_<seconds>.jpg into out/sheet.jpg, in time order, four across.
#   python3 film/sheet.py [first seconds] [last seconds]
import glob, os, subprocess, sys
lo = float(sys.argv[1]) if len(sys.argv) > 1 else -1
hi = float(sys.argv[2]) if len(sys.argv) > 2 else 1e9
here = os.path.dirname(os.path.abspath(__file__))
files = sorted((p for p in glob.glob(f'{here}/out/stills/t_*.jpg') if lo <= float(os.path.basename(p)[2:-4]) <= hi),
               key=lambda p: float(os.path.basename(p)[2:-4]))
n = len(files); cols = 4
inputs = [arg for f in files for arg in ('-i', f)]
layout = '|'.join(f'{(i % cols) * 480}_{(i // cols) * 270}' for i in range(n))
graph = ''.join(f'[{i}:v]scale=480:270[v{i}];' for i in range(n)) + ''.join(f'[v{i}]' for i in range(n)) + f'xstack=inputs={n}:layout={layout}:fill=black[out]'
subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *inputs, '-filter_complex', graph, '-map', '[out]', f'{here}/out/sheet.jpg'], check=True)
print('sheet:', ' '.join(os.path.basename(f)[2:-4] for f in files))
