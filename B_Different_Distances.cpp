#include <iostream>
#include <vector>

using namespace std;

void solve() {
    int n;
    cin >> n;
    
    vector<int> ans;
    
    // Block 1: 1 to n
    vector<int> block1(n);
    for(int i = 0; i < n; i++) {
        block1[i] = i + 1;
    }
    
    // If n is odd, swap the middle element with the one next to it 
    // to fix the single distance collision
    if (n % 2 != 0) {
        int m = (n + 1) / 2;
        // Arrays are 0-indexed, so the m-th element is at m-1
        swap(block1[m - 1], block1[m]);
    }
    
    // Add Block 1 to answer
    for(int i = 0; i < n; i++) {
        ans.push_back(block1[i]);
    }
    
    // Block 2: 1 1 2 2 3 3 ... n n
    for(int i = 1; i <= n; i++) {
        ans.push_back(i);
        ans.push_back(i);
    }
    
    // Block 3: 1 to n
    for(int i = 1; i <= n; i++) {
        ans.push_back(i);
    }
    
    // Print the constructed array
    for(int i = 0; i < ans.size(); i++) {
        cout << ans[i] << (i == ans.size() - 1 ? "" : " ");
    }
    cout << "\n";
}

int main() {
    // Fast I/O
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    
    int t;
    cin >> t;
    while(t--) {
        solve();
    }
    return 0;
}