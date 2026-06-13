#include <iostream>
#include <vector>
#include <cmath>
#include <algorithm>

using namespace std;

void solve() {
    long long a, b, x;
    cin >> a >> b >> x;

    // Store all possible values of 'a' after pure divisions
    vector<long long> A;
    long long curr_a = a;
    while (curr_a > 0) {
        A.push_back(curr_a);
        curr_a /= x;
    }
    A.push_back(0); // Any number eventually reaches 0

    // Store all possible values of 'b' after pure divisions
    vector<long long> B;
    long long curr_b = b;
    while (curr_b > 0) {
        B.push_back(curr_b);
        curr_b /= x;
    }
    B.push_back(0);

    long long min_ops = 2e18; // Initialize to a very large number

    // Compare every state of 'a' with every state of 'b'
    for (int i = 0; i < A.size(); i++) {
        for (int j = 0; j < B.size(); j++) {
            // ops = (divisions for a) + (divisions for b) + (additions to make them meet)
            long long ops = i + j + abs(A[i] - B[j]);
            if (ops < min_ops) {
                min_ops = ops;
            }
        }
    }

    cout << min_ops << "\n";
}

int main() {
    // Fast I/O for competitive programming
    ios_base::sync_with_stdio(false);
    cin.tie(NULL);
    
    int t;
    cin >> t;
    while (t--) {
        solve();
    }
    return 0;
}