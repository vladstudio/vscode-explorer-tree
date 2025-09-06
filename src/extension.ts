import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('explorerTree.generateTree', async (resource: vscode.Uri) => {
        try {
            const targetFolder = resource ? resource.fsPath : vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            
            if (!targetFolder) {
                vscode.window.showErrorMessage('No folder selected or workspace available');
                return;
            }

            const options = ['All files and folders', 'Folders only'];
            const selection = await vscode.window.showQuickPick(options, {
                placeHolder: 'Select tree generation mode'
            });

            if (!selection) {
                return;
            }

            const includeFiles = selection === 'All files and folders';
            const tree = await generateTree(targetFolder, includeFiles);
            
            const doc = await vscode.workspace.openTextDocument({
                content: tree,
                language: 'markdown'
            });
            
            await vscode.window.showTextDocument(doc);
        } catch (error) {
            vscode.window.showErrorMessage(`Error generating tree: ${error}`);
        }
    });

    context.subscriptions.push(disposable);
}

async function generateTree(rootPath: string, includeFiles: boolean): Promise<string> {
    const config = vscode.workspace.getConfiguration('files');
    const excludePatterns = config.get<{[key: string]: boolean}>('exclude') || {};
    
    const rootName = path.basename(rootPath);
    const result = await buildTree(rootPath, '', includeFiles, excludePatterns);
    
    return rootName + '\n' + result;
}

async function getDirectoryEntries(dirPath: string, excludePatterns: {[key: string]: boolean}): Promise<{name: string, isDirectory: boolean}[]> {
    try {
        const entries = await fs.promises.readdir(dirPath);
        const filteredEntries = [];
        
        for (const entry of entries) {
            const fullPath = path.join(dirPath, entry);
            const relativePath = path.relative(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '', fullPath);
            
            let shouldExclude = false;
            for (const pattern of Object.keys(excludePatterns)) {
                if (excludePatterns[pattern] && matchesPattern(relativePath, pattern)) {
                    shouldExclude = true;
                    break;
                }
            }
            
            if (!shouldExclude) {
                const stats = await fs.promises.stat(fullPath);
                filteredEntries.push({
                    name: entry,
                    isDirectory: stats.isDirectory()
                });
            }
        }
        
        return filteredEntries.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) return -1;
            if (!a.isDirectory && b.isDirectory) return 1;
            return a.name.localeCompare(b.name);
        });
    } catch {
        return [];
    }
}

async function buildTree(dirPath: string, prefix: string, includeFiles: boolean, excludePatterns: {[key: string]: boolean}): Promise<string> {
    const entries = await getDirectoryEntries(dirPath, excludePatterns);
    const filteredEntries = includeFiles ? entries : entries.filter(entry => entry.isDirectory);
    
    let result = '';
    
    for (let i = 0; i < filteredEntries.length; i++) {
        const entry = filteredEntries[i];
        const isLast = i === filteredEntries.length - 1;
        const connector = isLast ? '└─ ' : '├─ ';
        
        result += prefix + connector + entry.name + '\n';
        
        if (entry.isDirectory) {
            const entryPath = path.join(dirPath, entry.name);
            const newPrefix = prefix + (isLast ? '   ' : '│  ');
            result += await buildTree(entryPath, newPrefix, includeFiles, excludePatterns);
        }
    }
    
    return result;
}

function matchesPattern(filePath: string, pattern: string): boolean {
    const regexPattern = pattern
        .replace(/\./g, '\\.')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(filePath) || regex.test(path.basename(filePath));
}

export function deactivate() {}