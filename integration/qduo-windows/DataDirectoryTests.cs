using System;
using System.IO;
using System.Linq;
using System.Text;
using QDuoWindows;

public static class DataDirectoryTests
{
    static int checks;
    static string fixture;
    static string marker;
    static readonly string Fallback = @"C:\QDuo-test-default-unused";
    static void Check(bool condition, string label) { if (!condition) throw new Exception("FAIL: " + label); checks++; Console.WriteLine("PASS: " + label); }
    static void Write(string value) { File.WriteAllText(marker, value, new UTF8Encoding(false)); }
    static void Rejected(string value, string label)
    {
        Write(value); bool rejected = false;
        try { AppConfig.ResolveDataDirectory(fixture, Fallback); }
        catch (InvalidDataException) { rejected = true; }
        catch (IOException) { rejected = true; }
        catch (ArgumentException) { rejected = true; }
        Check(rejected, label);
    }
    public static int Main()
    {
        fixture = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "QDuo-DataDirectory-Test-" + Guid.NewGuid().ToString("N"));
        marker = Path.Combine(fixture, "QDuoWindows.data-dir");
        Directory.CreateDirectory(fixture);
        try
        {
            Check(AppConfig.ResolveDataDirectory(fixture, Fallback) == Fallback, "no marker preserves the default verbatim");
            Check(new DriveInfo(@"D:\").IsReady, "local D drive available for resolver test");
            Write("D:\\QDuoWindows\\data\r\n");
            Check(AppConfig.ResolveDataDirectory(fixture, Fallback) == @"D:\QDuoWindows\data", "absolute D path with text newline accepted");
            Write("D:/QDuoWindows/data");
            Check(AppConfig.ResolveDataDirectory(fixture, Fallback) == @"D:\QDuoWindows\data", "absolute forward-slash path normalized");
            Rejected("", "empty marker rejected without fallback");
            Rejected("  \r\n", "whitespace marker rejected without fallback");
            Rejected("relative\\data", "relative path rejected");
            Rejected("D:data", "drive-relative path rejected");
            Rejected(@"\data", "root-relative path rejected");
            Rejected(@"\\server\share\data", "UNC path rejected");
            Rejected(@"\\?\D:\QDuoWindows\data", "device-prefixed path rejected");
            Rejected(@"D:\QDuoWindows\data:stream", "alternate-stream path rejected");
            Rejected(@"D:\QDuoWindows\d*ta", "wildcard path rejected");
            Rejected("D:\\first\r\nD:\\second", "multi-line marker rejected");
            Rejected(new string('x', 4097), "oversized marker rejected");
            File.WriteAllBytes(marker, new byte[] { 0xff, 0xff, 0xff });
            bool invalidEncodingRejected = false;
            try { AppConfig.ResolveDataDirectory(fixture, Fallback); } catch (DecoderFallbackException) { invalidEncodingRejected = true; }
            Check(invalidEncodingRejected, "invalid text encoding rejected");
            string missingDrive = Enumerable.Range('D', 'Z' - 'D' + 1).Select(c => ((char)c) + @":\").First(d => !Directory.Exists(d));
            Rejected(missingDrive + "QDuo-data", "unavailable drive rejected without fallback");
            string fileTarget = Path.Combine(fixture, "not-a-directory"); File.WriteAllText(fileTarget, "test fixture");
            Rejected(fileTarget, "existing file target rejected");
            Rejected(Path.Combine(fileTarget, "child"), "existing file ancestor rejected");
            File.Delete(fileTarget); File.Delete(marker); Directory.CreateDirectory(marker);
            bool directoryMarkerRejected = false;
            try { AppConfig.ResolveDataDirectory(fixture, Fallback); } catch (InvalidDataException) { directoryMarkerRejected = true; }
            Check(directoryMarkerRejected, "directory used as marker rejected");
            Directory.Delete(marker);
            Check(AppConfig.Unprotect(AppConfig.Protect("synthetic DPAPI roundtrip")) == "synthetic DPAPI roundtrip", "DPAPI protection remains compatible");
            Check(!File.Exists(Path.Combine(fixture, "settings.json")), "resolver never writes settings or pairing tokens");
            Check(typeof(AppConfig).Assembly.GetName().Version.ToString() == "1.2.1.0", "built assembly version is 1.2.1.0");
            Console.WriteLine("ALL " + checks + " DATA DIRECTORY TESTS PASSED");
            return 0;
        }
        catch (Exception ex) { Console.Error.WriteLine(ex); return 1; }
        finally
        {
            // Fixed names inside this invocation's own fixture; no recursion.
            if (File.Exists(marker)) File.Delete(marker);
            if (Directory.Exists(marker)) Directory.Delete(marker);
            string target = Path.Combine(fixture, "not-a-directory"); if (File.Exists(target)) File.Delete(target);
            if (Directory.Exists(fixture)) Directory.Delete(fixture);
        }
    }
}
