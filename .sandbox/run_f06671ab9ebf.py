import shutil
import os

print('Available archive formats:', [f[0] for f in shutil.get_archive_formats()])
print('Supported unpack formats:', [f[0] for f in shutil.get_unpack_formats()])

# Cek apakah file 7z sudah disimpan di sandbox atau workspace
print('Files in current dir:', os.listdir('.'))
if os.path.exists('.sandbox'):
    print('Files in .sandbox:', os.listdir('.sandbox'))
