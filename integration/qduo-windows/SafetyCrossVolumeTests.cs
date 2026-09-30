using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.IO.Compression;
using System.Linq;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Web.Script.Serialization;
using QDuoWindows;

public static class SafetyCrossVolumeTests
{
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern bool CreateHardLink(string name,string existing,IntPtr security);
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] static extern Microsoft.Win32.SafeHandles.SafeFileHandle CreateFile(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
    static Dictionary<string,object> Obj(object x) { return (Dictionary<string,object>)x; }
    static IEnumerable<Dictionary<string,object>> Rows(object x) { return ((IEnumerable)x).Cast<object>().Select(Obj); }
    static string Str(Dictionary<string,object> d,string k) { return Convert.ToString(d[k]); }
    static void Check(bool pass,string label) { if(!pass) throw new Exception("FAIL: "+label); Console.WriteLine("PASS: "+label); }
    static void Old(string p) { DateTime t=DateTime.UtcNow.AddDays(-45); File.SetCreationTimeUtc(p,t); File.SetLastWriteTimeUtc(p,t); File.SetLastAccessTimeUtc(p,t); }
    static string Hash(string p) { using(var f=File.OpenRead(p)) using(var h=SHA256.Create()) return BitConverter.ToString(h.ComputeHash(f)); }
    static object Invoke(string name,params object[] args) { return typeof(SafetyService).GetMethod(name,BindingFlags.NonPublic|BindingFlags.Static).Invoke(null,args); }
    // The public scanner is exercised once below. Targeted follow-ups invoke
    // that same candidate guard for this test's fixed D3DSCache root, avoiding
    // whole-computer scan quotas making the fixture nondeterministically absent.
    static string Candidate(string p) { try { object root=Invoke("R",Path.GetDirectoryName(fixture),"Direct3D test","test","low",7,new string[0]); object candidate=Invoke("MakeCandidate",p,root,Invoke("RunningProcesses")); if(candidate==null)return null; string id=(string)candidate.GetType().GetField("Id").GetValue(candidate); ((IDictionary)typeof(SafetyService).GetField("Candidates",BindingFlags.NonPublic|BindingFlags.Static).GetValue(null))[id]=candidate; return id; } catch(TargetInvocationException ex) { if(ex.InnerException is IOException)return null; throw; } }
    static string Plan(string p) { string id=Candidate(p); Check(id!=null,"fixture candidate admitted"); return Str(Obj(SafetyService.CreatePlan("low",new[]{id})),"planId"); }
    static string fixture;
    static string path;
    static Dictionary<string,object> D(params object[] v) { var d=new Dictionary<string,object>();for(int i=0;i<v.Length;i+=2)d[(string)v[i]]=v[i+1];return d; }
    static void TestLegacy(int format)
    {
        string recovery=(string)typeof(SafetyService).GetField("LegacyQuarantine",BindingFlags.NonPublic|BindingFlags.Static).GetValue(null);
        Check((bool)Invoke("SafeAncestors",recovery),"legacy recovery path safe"); Directory.CreateDirectory(recovery); Invoke("Key",recovery,true);
        string id=Guid.NewGuid().ToString("N"),dir=Path.Combine(recovery,id),source=Path.Combine(fixture,"legacy"+format+".cache"); Directory.CreateDirectory(dir); File.WriteAllText(source,"legacy fixture "+format);Old(source);
        string zipName=Guid.NewGuid().ToString("N")+".zip",originalName=Guid.NewGuid().ToString("N")+".original",hash=Hash(source).Replace("-","").ToLowerInvariant(); Old(source);
        var f=new FileInfo(source); var record=D("id",Guid.NewGuid().ToString("N"),"path",source,"root",Path.GetDirectoryName(fixture),"risk","low","bytes",f.Length,"createdTicks",f.CreationTimeUtc.Ticks,"modifiedTicks",f.LastWriteTimeUtc.Ticks,"accessTicks",f.LastAccessTimeUtc.Ticks,"attributes",(int)f.Attributes,"sha256",hash,"archive",zipName,"state","quarantined");
        using(var file=new FileStream(Path.Combine(dir,zipName),FileMode.CreateNew))using(var zip=new ZipArchive(file,ZipArchiveMode.Create))using(var input=File.OpenRead(source))using(var entry=zip.CreateEntry("content").Open())input.CopyTo(entry);
        record["zipBytes"]=new FileInfo(Path.Combine(dir,zipName)).Length;record["archiveBytes"]=record["zipBytes"];
        var journal=D("schemaVersion",1,"policyVersion","qd-safe-cache-2026-09-v1","transactionId",id,"startedAt",DateTime.UtcNow.ToString("o"),"completedAt",DateTime.UtcNow.ToString("o"),"status","completed","records",new[]{record},"risk","low");
        if(format==2){record["kind"]="full-file";record["preservedFile"]=originalName;journal["journalFormat"]=2;journal["method"]="original-rename-ntfs";}
        Invoke("SaveJournalAt",recovery,id,journal); if(format==2)File.Move(source,Path.Combine(dir,originalName));else File.Delete(source);
        var restored=Obj(SafetyService.Restore(id));Check(Convert.ToInt32(restored["restoredFiles"])==1&&Hash(source).Replace("-","").ToLowerInvariant()==hash,"legacy format "+format+" restore remains compatible");
    }
    public static int Main()
    {
        try
        {
            fixture=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"D3DSCache","QDuo-Safety-Test-"+Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(fixture); path=Path.Combine(fixture,"payload.cache");
            byte[] block=new byte[1024*1024]; using(var r=RandomNumberGenerator.Create()) r.GetBytes(block);
            using(var f=new FileStream(path,FileMode.CreateNew)) { for(int i=0;i<64;i++) f.Write(block,0,block.Length); f.Flush(true); }
            FileSecurity acl=new FileSecurity(); acl.SetAccessRuleProtection(true,false); acl.SetOwner(WindowsIdentity.GetCurrent().User);
            acl.AddAccessRule(new FileSystemAccessRule(WindowsIdentity.GetCurrent().User,FileSystemRights.FullControl,AccessControlType.Allow));
            acl.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier("S-1-5-18"),FileSystemRights.Read,AccessControlType.Allow));
            File.SetAccessControl(path,acl); File.SetAttributes(path,FileAttributes.Hidden|FileAttributes.Archive|FileAttributes.NotContentIndexed); Old(path);
            string expectedHash=Hash(path); Old(path);
            string expectedAcl=File.GetAccessControl(path).GetSecurityDescriptorSddlForm(AccessControlSections.Owner|AccessControlSections.Group|AccessControlSections.Access);
            DateTime created=File.GetCreationTimeUtc(path),written=File.GetLastWriteTimeUtc(path),accessed=File.GetLastAccessTimeUtc(path);
            FileAttributes attributes=File.GetAttributes(path);
            string ads=Path.Combine(fixture,"ads.cache"); File.WriteAllBytes(ads,block); using(var adsHandle=CreateFile(ads+":guard",0x40000000,0,IntPtr.Zero,1,0x80,IntPtr.Zero)) using(var adsStream=new FileStream(adsHandle,FileAccess.Write)) adsStream.Write(block,0,4); Old(ads);
            string hard=Path.Combine(fixture,"hard.cache"), hard2=Path.Combine(fixture,"hard2.cache"); File.WriteAllBytes(hard,block); Check(CreateHardLink(hard2,hard,IntPtr.Zero),"hardlink fixture created"); Old(hard);
            string locked=Path.Combine(fixture,"locked.cache"); File.WriteAllBytes(locked,block); Old(locked);
            string recent=Path.Combine(fixture,"recent.cache"); File.WriteAllBytes(recent,block);
            string changed=Path.Combine(fixture,"changed.cache"); File.WriteAllBytes(changed,block); Old(changed);
            string protectedFile=Path.Combine(fixture,"notes.txt"); File.WriteAllText(protectedFile,"not cache"); Old(protectedFile);
            string pendingFile=Path.Combine(fixture,"pending.cache");File.WriteAllText(pendingFile,"delete-pending guard test");
            using(var pendingHandle=(Microsoft.Win32.SafeHandles.SafeFileHandle)Invoke("OpenCrossVolumeSource",pendingFile))
            {
                Invoke("SetDeletePending",pendingHandle,true);
                try
                {
                    using(var lateStream=CreateFile(pendingFile+":late",0x40000000,7,IntPtr.Zero,1,0x80,IntPtr.Zero))Check(lateStream.IsInvalid,"delete-pending prevents a late ADS creation");
                    Check(!CreateHardLink(Path.Combine(fixture,"pending-late-link.cache"),pendingFile,IntPtr.Zero),"delete-pending prevents a late hardlink");
                }
                finally { Invoke("SetDeletePending",pendingHandle,false); }
            }
            Check(File.Exists(pendingFile),"revoking deletion preserves original file");
            var scan=Obj(SafetyService.Scan(true)); var candidates=Rows(scan["candidates"]).Select(d=>Str(d,"path")).ToArray();
            Check(!candidates.Contains(ads),"ADS candidate rejected"); Check(!candidates.Contains(hard)&&!candidates.Contains(hard2),"hardlinks rejected"); Check(!candidates.Contains(recent),"recent file rejected"); Check(!candidates.Contains(protectedFile),"document extension rejected");
            Check(Candidate(ads)==null&&Candidate(hard)==null&&Candidate(hard2)==null,"native ADS and hardlink guard rejects fixtures directly");
            foreach(string junction in new[]{Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"pip","Cache"),Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"uv","cache")})
                if(Directory.Exists(junction)&&(File.GetAttributes(junction)&FileAttributes.ReparsePoint)!=0) Check(!(bool)Invoke("SafeAncestors",junction),"existing cache junction rejected without following it");
            using(var hold=new FileStream(locked,FileMode.Open,FileAccess.Read,FileShare.None)) Check(Candidate(locked)==null,"active exclusive file rejected");
            string changedPlan=Plan(changed); File.AppendAllText(changed,"changed after planning");
            var changedResult=Obj(SafetyService.ExecutePlan(changedPlan,false)); Check(Convert.ToInt32(changedResult["quarantinedFiles"])==0&&File.Exists(changed),"modified candidate retained");
            string cleanPlan=Plan(path); var clean=Obj(SafetyService.ExecutePlan(cleanPlan,false));
            Console.WriteLine(new JavaScriptSerializer().Serialize(clean));
            Check(Convert.ToInt32(clean["quarantinedFiles"])==1&&!File.Exists(path),"C source removed only after D verified backup");
            string transaction=Str(clean,"transactionId"), backup=Str(clean,"quarantinePath"); Check(backup.StartsWith(@"D:\QDuo-Backups\",StringComparison.OrdinalIgnoreCase),"fixed D recovery path");
            var drives=Rows(clean["drives"]).ToArray(); Check(drives.Any(d=>Str(d,"name")==@"C:\")&&drives.Any(d=>Str(d,"name")==@"D:\"),"C and D deltas reported separately");
            Check(Convert.ToInt64(drives.Single(d=>Str(d,"name")==@"C:\")["freeDelta"])>0,"C disk space measurably released");
            string zip=Directory.GetFiles(backup,"*.zip").Single(), held=zip+".test-held"; File.Move(zip,held); File.WriteAllText(zip,"corrupt test archive");
            try { var corrupt=Obj(SafetyService.Restore(transaction)); Check(Convert.ToInt32(corrupt["restoredFiles"])==0&&!File.Exists(path),"corrupt backup never creates restored file"); }
            finally { File.Delete(zip); File.Move(held,zip); }
            File.WriteAllText(path,"new cache must not be overwritten"); var conflict=Obj(SafetyService.Restore(transaction)); Check(Convert.ToInt32(conflict["restoredFiles"])==0&&File.ReadAllText(path)=="new cache must not be overwritten","restore refuses existing destination"); File.Delete(path);
            var restored=Obj(SafetyService.Restore(transaction)); Console.WriteLine(new JavaScriptSerializer().Serialize(restored));
            Check(Convert.ToInt32(restored["restoredFiles"])==1&&File.Exists(path),"cross-volume restore completes");
            Check(File.GetCreationTimeUtc(path)==created&&File.GetLastWriteTimeUtc(path)==written&&File.GetLastAccessTimeUtc(path)==accessed,"all three file times restored");
            Check(File.GetAttributes(path)==attributes,"file attributes restored");
            Check((bool)Invoke("SamePermissions",new RawSecurityDescriptor(File.GetAccessControl(path).GetSecurityDescriptorBinaryForm(),0),new RawSecurityDescriptor(expectedAcl)),"owner group and every DACL permission restored");
            Check(Hash(path)==expectedHash,"restored content SHA-256 identical"); Check(Directory.GetFiles(backup,"*.zip").Length==1,"D backup retained after restore");
            string inherited=Path.Combine(fixture,"inherited.cache"); File.WriteAllText(inherited,"inherited ACL test");Old(inherited);byte[] inheritedAcl=File.GetAccessControl(inherited).GetSecurityDescriptorBinaryForm();
            var inheritedClean=Obj(SafetyService.ExecutePlan(Plan(inherited),false)); Check(Convert.ToInt32(inheritedClean["quarantinedFiles"])==1,"inherited-permission cache backs up");
            var inheritedRestore=Obj(SafetyService.Restore(Str(inheritedClean,"transactionId")));Check(Convert.ToInt32(inheritedRestore["restoredFiles"])==1&&(bool)Invoke("SamePermissions",new RawSecurityDescriptor(File.GetAccessControl(inherited).GetSecurityDescriptorBinaryForm(),0),new RawSecurityDescriptor(inheritedAcl,0)),"inherited owner group and DACL restore exactly");
            TestLegacy(1); TestLegacy(2);
            // Tampering is limited to this test's own completed journal; restore
            // must reject it before any filesystem mutation. Put it back next.
            string journal=Path.Combine(backup,"journal.json"); byte[] original=File.ReadAllBytes(journal); File.AppendAllText(journal,"tampered"); bool rejected=false;
            try { SafetyService.Restore(transaction); } catch { rejected=true; } finally { File.WriteAllBytes(journal,original); }
            Check(rejected,"tampered recovery journal rejected");
            Console.WriteLine("ALL CROSS-VOLUME TESTS PASSED; fixture="+fixture+"; recovery="+backup);
            return 0;
        }
        catch(Exception ex) { Console.Error.WriteLine(ex); return 1; }
        finally
        {
            // Only this invocation's explicitly named test directory is touched.
            // Keep all D transaction evidence and never follow reparse points.
            if(fixture!=null&&Directory.Exists(fixture)&&Path.GetFileName(fixture).StartsWith("QDuo-Safety-Test-",StringComparison.Ordinal))
                foreach(string f in Directory.GetFiles(fixture)) { try { if((File.GetAttributes(f)&FileAttributes.ReparsePoint)==0) { File.SetAttributes(f,FileAttributes.Normal); File.Delete(f); } } catch{} }
        }
    }
}
