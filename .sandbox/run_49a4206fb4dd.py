import subprocess
import os

file_path = '../kumpulan_all_scrape.7z'
print('File size:', os.path.getsize(file_path))

# Coba ekstrak pakai python py7zr jika ada, atau buat command eksternal
try:
    import py7zr
    with py7zr.SevenZipFile(file_path, mode='r') as z:
        z.extractall(path='extracted_scrape')
    print('Extracted successfully with py7zr!')
    print('Extracted files:', os.listdir('extracted_scrape'))
except ImportError:
    print('py7zr not installed. Trying to install...')
    res = subprocess.run(['pip', 'install', 'py7zr', '--user'], capture_output=True, text=True)
    print(res.stdout)
    try:
        import py7zr
        with py7zr.SevenZipFile(file_path, mode='r') as z:
            z.extractall(path='extracted_scrape')
        print('Extracted successfully after installing py7zr!')
        print('Extracted files:', os.listdir('extracted_scrape'))
    except Exception as e:
        print('Error with py7zr:', e)
except Exception as e:
    print('Error:', e)
